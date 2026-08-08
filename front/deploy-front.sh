#!/usr/bin/env bash
set -Eeuo pipefail

# No database step here, unlike deploy-api.sh: the front never talks to MySQL, it
# only calls the API. Migrations belong to whoever owns the schema, and running
# them from two scripts would mean two deploys racing for the same lock. If a
# release needs a schema change, deploy the API first. (COS-460)

######################################
# Configuration
######################################
REMOTE_USER_HOST="debian@ks-b"
WEB_ROOT_BASE="/var/www/spira"
CURRENT_DIR="$WEB_ROOT_BASE/public_html"
BACKUP_DIR="$WEB_ROOT_BASE/public_html.bak"
RELEASES_DIR="$CURRENT_DIR/releases"
PM2_ECOSYSTEM_FILE="ecosystem.config.cjs"

# Allow running the script from any location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

######################################
# Reporting to Zeus (COS-459)
######################################
# Spira's slug in Zeus's port registry, and which half of it this script deploys.
ZEUS_APP_NAME="${ZEUS_APP_NAME:-spira}"
ZEUS_ROLE="front"

# The two files **on ks-b** that may hold the ingest URL and the shared secret — the **API's**, not
# the front's own `ecosystem.config.cjs` beside it.
#
# Not an oversight: the token belongs to one place per app and the API's ecosystem file is where
# COS-447 puts it. The front never validates it, so it has no claim on a copy, and duplicating a
# secret into a second file only creates two things that can disagree. Zeus's own deploy-front.sh
# reads Zeus's API ecosystem file for exactly this reason.
ZEUS_ECOSYSTEM_FILE="${ZEUS_ECOSYSTEM_FILE:-$WEB_ROOT_BASE/ecosystem.config.js}"
ZEUS_ENV_FILE="${ZEUS_ENV_FILE:-$WEB_ROOT_BASE/nest-api/.env}"

# The served changelog and the marker holding the last deployed commit. Hoisted out of
# `write_deploy_log` because the report to Zeus measures its commit range from the same marker, and
# two independent resolutions of the same baseline is how they drift apart.
DEPLOY_LOG_DIR="$WEB_ROOT_BASE/deploy-logs"
DEPLOY_LOG_FILE="$DEPLOY_LOG_DIR/deploys-$ZEUS_ROLE.txt"
DEPLOY_MARKER="$DEPLOY_LOG_DIR/.last-$ZEUS_ROLE"

######################################
# Utility functions
######################################

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# The commit the previous deploy shipped — the base of this deploy's commit range.
#
# Order: the marker (steady state) → a `SPIRA_SINCE` override → the newest release folder's hash →
# empty, which both consumers read as "no baseline, fall back to the last ten commits". Same order
# `write_deploy_log` used inline before, so the changelog is unchanged; the difference is that it now
# happens once and both consumers read the answer.
#
# Resolved **once, before anything writes**. `write_deploy_log` moves the marker at the end of a
# successful deploy, so a second resolution later in the run would return this deploy's own commit
# and both the changelog and the report to Zeus would come out claiming nothing shipped.
resolve_base_hash() {
  local base
  base=$(ssh "$REMOTE_USER_HOST" "cat '$DEPLOY_MARKER' 2>/dev/null || true" 2>/dev/null || true)
  [ -z "$base" ] && base="${SPIRA_SINCE:-}"
  [ -z "$base" ] && base="${PREV_FROM_SERVER:-}"

  # A hash this checkout does not have is no baseline at all — a shallow clone, or a marker left by
  # a deploy from a branch since rewritten.
  if [ -n "$base" ] && ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    base=""
  fi

  printf '%s' "$base"
}

# The commits this deploy ships, as a JSON array, newest first.
#
# `ZEUS_BASE_HASH` is the commit the last deploy shipped; with none — a first report — the last ten
# commits stand in for a range nobody can reconstruct, the same baseline the changelog uses.
#
# Every message is escaped in awk rather than interpolated into a shell string. `%s` is the subject
# line only, so it cannot contain a newline, and splitting on the first two spaces is exact because
# neither a sha nor an ISO-8601 date contains one.
zeus_commits_json() {
  local -a range

  # A manual rollback restores a release rather than shipping one. Falling through to the last-ten
  # baseline there would claim it delivered ten commits it had nothing to do with.
  if [ "${ZEUS_REPORT_COMMITS:-true}" != "true" ]; then
    printf '[]'
    return 0
  fi

  if [ -n "${ZEUS_BASE_HASH:-}" ]; then
    range=("${ZEUS_BASE_HASH}..HEAD")
  else
    range=(-n 10 HEAD)
  fi

  git log --no-merges --pretty=format:'%H %aI %s' "${range[@]}" 2>/dev/null | awk '
    BEGIN { printf "["; first = 1 }
    NF >= 3 {
      sha = $1
      when = $2
      msg = substr($0, length(sha) + length(when) + 3)
      gsub(/\\/, "\\\\", msg)
      gsub(/"/, "\\\"", msg)
      gsub(/\t/, " ", msg)
      if (!first) printf ","
      printf "{\"sha\":\"%s\",\"authoredAt\":\"%s\",\"message\":\"%s\"}", sha, when, msg
      first = 0
    }
    END { printf "]" }'
}

# Escape a value for a JSON string literal.
#
# `zeus_commits_json` escapes commit messages in awk because it reads them a line at a time. Every
# *other* string in the payload is interpolated by hand below, and Zeus's original does that raw —
# fine for the summaries this script actually passes, all of them quote-free literals, and one
# `zeus_report "failed" "could not read \"x\""` away from posting malformed JSON. Zeus would answer
# 400, and since every error on this path is swallowed the report would vanish with no symptom.
# Applied to every field rather than the ones that look risky, so nothing here needs re-deciding.
#
# Backslash first: the reverse order would escape the backslashes this step adds. Commit subjects
# and git ref names cannot contain a newline, so tab is the only control character left to handle.
json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

# Tell Zeus what this deploy did: `zeus_report <success|failed|rolled_back> [summary]`.
#
# Three rules, from `Zeus/docs/reporting/README.md`, and none of them is optional:
#   1. reporting must never fail the deploy — every step here is `|| true`, and the caller ignores
#      the return value too;
#   2. fire and forget, 2 second timeout, no retries;
#   3. the payload travels as a **file**, never interpolated into a shell command, because commit
#      messages contain quotes, backticks and `$`.
#
# The POST happens on ks-b over ssh rather than from here: the endpoint is loopback-only and nginx
# denies it from outside the box.
zeus_report() {
  local status="$1"
  local summary="${2:-}"
  local commits payload remote_payload duration

  commits=$(zeus_commits_json 2>/dev/null || echo "[]")
  duration=$(( ($(date +%s) - ${ZEUS_STARTED_EPOCH:-$(date +%s)}) * 1000 ))
  payload=$(mktemp)
  remote_payload="/tmp/.zeus-deploy-report.$$.json"

  {
    printf '{"app":"%s","role":"%s","status":"%s"' \
      "$(json_escape "$ZEUS_APP_NAME")" "$(json_escape "$ZEUS_ROLE")" "$(json_escape "$status")"
    printf ',"startedAt":"%s","durationMs":%s' "$(json_escape "${ZEUS_STARTED_AT}")" "$duration"
    [ -n "${ZEUS_RELEASE:-}" ] && printf ',"release":"%s"' "$(json_escape "$ZEUS_RELEASE")"
    [ -n "${ZEUS_COMMIT:-}" ] && printf ',"commit":"%s"' "$(json_escape "$ZEUS_COMMIT")"
    [ -n "${ZEUS_BRANCH:-}" ] && printf ',"branch":"%s"' "$(json_escape "$ZEUS_BRANCH")"
    [ -n "$summary" ] && printf ',"summary":"%s"' "$(json_escape "$summary")"
    printf ',"commits":%s}' "$commits"
  } > "$payload"

  scp -q "$payload" "$REMOTE_USER_HOST:$remote_payload" || { rm -f "$payload"; return 0; }
  rm -f "$payload"

  ssh "$REMOTE_USER_HOST" \
    ZEUS_ECOSYSTEM_FILE="$ZEUS_ECOSYSTEM_FILE" \
    ZEUS_ENV_FILE="$ZEUS_ENV_FILE" \
    PAYLOAD="$remote_payload" \
    'bash -s' << 'EOF' || true
set -uo pipefail

cleanup() { rm -f "$PAYLOAD"; }
trap cleanup EXIT

# One setting, looked for in the pm2 ecosystem file first and the `.env` second.
#
# **That order is not a preference, it is the order the API itself resolves them.** pm2 injects
# `env_production` into the process environment before Nest starts, and dotenv does not overwrite a
# variable that is already there — so a value in the ecosystem file wins, and the `.env` is only
# consulted when the ecosystem file is silent. Reading the `.env` alone would present a token the
# API is not validating against the day the two files disagree, which is a `401` on every deploy
# report and no other symptom.
#
# Neither value is ever defaulted here. A fallback URL would put Zeus's port in this repo's source,
# which is the one place a port reassignment cannot rewrite — and since every error below is
# swallowed, a stale default would fail quietly and forever.
#
# `\042` and `\047` are the double and single quote, so a value written either way is unwrapped
# without this needing quotes of its own inside a heredoc.
read_setting() {
  local key="$1" value=""

  if [ -f "$ZEUS_ECOSYSTEM_FILE" ]; then
    value=$(sed -n "s/.*${key}: *['\"]\([^'\"]*\)['\"].*/\1/p" "$ZEUS_ECOSYSTEM_FILE" 2>/dev/null | tail -1)
  fi

  if [ -z "$value" ] && [ -f "$ZEUS_ENV_FILE" ]; then
    value=$(sed -n "s/^${key}=//p" "$ZEUS_ENV_FILE" 2>/dev/null | tail -1 | tr -d '\042\047')
  fi

  printf '%s' "$value"
}

url=$(read_setting ZEUS_DEPLOY_INGEST_URL)
token=$(read_setting ZEUS_INGEST_TOKEN)

if [ -z "$url" ] || [ -z "$token" ]; then
  echo "zeus: not reported — ZEUS_DEPLOY_INGEST_URL or ZEUS_INGEST_TOKEN found in neither" \
    "$ZEUS_ECOSYSTEM_FILE nor $ZEUS_ENV_FILE"
  exit 0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
  -X POST "$url" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $token" \
  --data-binary @"$PAYLOAD" || true)

# 202 is the contract. Anything else is worth one line in the deploy output and nothing more —
# a deploy that shipped and could not say so still shipped.
[ "$code" = "202" ] || echo "zeus: report not recorded (HTTP ${code:-none})"
EOF
}

remote_pm2_reload() {
  ssh "$REMOTE_USER_HOST" \
    CURRENT_DIR="$CURRENT_DIR" \
    PM2_ECOSYSTEM_FILE="$PM2_ECOSYSTEM_FILE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

export PATH="/home/debian/.npm-global/bin:/home/debian/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin:/usr/sbin:$PATH"

cd "$CURRENT_DIR"

if [ ! -f "$PM2_ECOSYSTEM_FILE" ]; then
  echo "❌ ERROR: Missing PM2 ecosystem file: $CURRENT_DIR/$PM2_ECOSYSTEM_FILE" >&2
  exit 1
fi

pm2 startOrReload "$CURRENT_DIR/$PM2_ECOSYSTEM_FILE" --update-env
pm2 save
EOF
}

# Remote rollback helper (used by manual and auto rollback)
remote_rollback() {
  ssh "$REMOTE_USER_HOST" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    WEB_ROOT_BASE="$WEB_ROOT_BASE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

cd "$WEB_ROOT_BASE"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ ERROR: No backup directory found at $BACKUP_DIR" >&2
  exit 1
fi

mkdir -p "$CURRENT_DIR"
cd "$CURRENT_DIR"

TMP_RELEASES_DIR="$WEB_ROOT_BASE/.releases_tmp_rollback"

if [ -d "releases" ]; then
  rm -rf "$TMP_RELEASES_DIR"
  mv "releases" "$TMP_RELEASES_DIR"
fi

shopt -s dotglob
if compgen -G "*" > /dev/null; then
  rm -rf * 2>/dev/null || true
fi
shopt -u dotglob

if [ -d "$TMP_RELEASES_DIR" ]; then
  mv "$TMP_RELEASES_DIR" "$CURRENT_DIR/releases"
fi

if [ -d "$BACKUP_DIR" ]; then
  shopt -s dotglob
  if compgen -G "$BACKUP_DIR/*" > /dev/null; then
    mv "$BACKUP_DIR"/* "$CURRENT_DIR"/ 2>/dev/null || true
  fi
  shopt -u dotglob
fi

rm -rf "$BACKUP_DIR"
EOF
}

deploy() {
  cd "$SCRIPT_DIR"

  local GIT_HASH
  GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")

  local GIT_BRANCH_RAW
  GIT_BRANCH_RAW=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-branch")

  local GIT_BRANCH
  GIT_BRANCH=${GIT_BRANCH_RAW//\//-}
  GIT_BRANCH=${GIT_BRANCH// /_}

  local TIMESTAMP
  TIMESTAMP=$(date +'%Y%m%d-%H%M%S')

  local RELEASE_NAME="release-${TIMESTAMP}-${GIT_BRANCH}-${GIT_HASH}"
  local STAGING_DIR="$RELEASES_DIR/$RELEASE_NAME"
  local SWITCH_DONE="false"

  # Current live front commit, read from the newest release folder name (…-<hash>) before this
  # deploy's own staging folder is created. Used only to seed the changelog on the very first run
  # (no marker yet). Non-fatal: an empty value just falls back to the last-10 baseline.
  local PREV_FROM_SERVER
  PREV_FROM_SERVER=$(ssh "$REMOTE_USER_HOST" "ls -1 '$RELEASES_DIR' 2>/dev/null | sort | tail -1" 2>/dev/null \
    | sed -nE 's/.*-([0-9a-f]{7,40})$/\1/p' || true)

  # What the report to Zeus will carry (COS-459), gathered here so that a deploy which fails at its
  # very first step still reports something true. Not `local`: `zeus_report` is defined outside this
  # function, and the failure path calls it from the ERR trap.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_RELEASE="$RELEASE_NAME"
  ZEUS_BRANCH="$GIT_BRANCH_RAW"
  ZEUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
  ZEUS_BASE_HASH=$(resolve_base_hash)

  on_error() {
    local lineno=$1
    log "❌ ERROR: Deployment failed at line $lineno"

    if [[ "$SWITCH_DONE" == "true" ]]; then
      log "↩️  Auto rollback: switching back to previous version"
      if remote_rollback; then
        remote_pm2_reload || true
        log "✅ Auto rollback succeeded"
        # `rolled_back`, not `failed`, and the distinction is the whole reason Zeus has three
        # statuses: the deploy did fail, and the box is serving exactly what it served before.
        zeus_report "rolled_back" "deploy failed at line $lineno — previous release restored" || true
      else
        log "❌ Auto rollback failed, manual intervention required"
        zeus_report "failed" "deploy failed at line $lineno — rollback failed too" || true
      fi
    else
      log "ℹ️  No rollback needed: production was not modified yet"
      zeus_report "failed" "deploy failed at line $lineno — production was not modified" || true
    fi
  }

  # Prepend this deploy's commits (+ Linear tickets) to the served changelog.
  # Always invoked as `write_deploy_log || log ...`, so errexit is ignored throughout:
  # a changelog hiccup can never fail or roll back an otherwise successful deploy.
  write_deploy_log() {
    local LOG_DIR="$DEPLOY_LOG_DIR"
    local LOG_FILE="$DEPLOY_LOG_FILE"
    local MARKER="$DEPLOY_MARKER"
    local FULL_HASH WHEN PREV_HASH TICKETS COMMITS ENTRY_TMP
    local -a RANGE
    FULL_HASH=$(git rev-parse HEAD)
    WHEN=$(date +'%Y-%m-%d %H:%M:%S')

    # Already resolved for the whole run — see `resolve_base_hash`. Reading the marker again here
    # would be reading it after this function's own previous run moved it.
    PREV_HASH="${ZEUS_BASE_HASH:-}"
    if [ -n "$PREV_HASH" ]; then
      RANGE=("${PREV_HASH}..HEAD")
    else
      RANGE=(-n 10 HEAD)
    fi

    # One git-log call, captured into a var (pipefail-safe: no `| grep -q` on a pipe git may SIGPIPE).
    COMMITS=$(git log --no-merges --pretty=format:'  %h  %ad  %s' --date=short "${RANGE[@]}")
    TICKETS=$(printf '%s\n' "$COMMITS" \
      | grep -oiE 'COS-[0-9]+' | tr 'a-z' 'A-Z' | sort -t- -k2,2n -u | paste -sd ',' - | sed 's/,/, /g' || true)

    ENTRY_TMP=$(mktemp)
    {
      echo "=== $WHEN · branch $GIT_BRANCH_RAW · deploy $GIT_HASH ==="
      [ -n "$TICKETS" ] && echo "Tickets: $TICKETS"
      [ -z "$PREV_HASH" ] && echo "  (first recorded deploy — baseline: last 10 commits, not full history)"
      if [ -n "$COMMITS" ]; then
        printf '%s\n' "$COMMITS"
      else
        echo "  (no new commit — redeploy of $GIT_HASH)"
      fi
      echo
    } > "$ENTRY_TMP"

    # Commit messages travel as file content (scp), never interpolated into a shell command.
    ssh "$REMOTE_USER_HOST" "mkdir -p '$LOG_DIR'"
    scp -q "$ENTRY_TMP" "$REMOTE_USER_HOST:$LOG_DIR/.entry.tmp"
    ssh "$REMOTE_USER_HOST" \
      LOG_DIR="$LOG_DIR" \
      LOG_FILE="$LOG_FILE" \
      MARKER="$MARKER" \
      FULL_HASH="$FULL_HASH" \
      'bash -s' << 'EOF'
set -Eeuo pipefail
touch "$LOG_FILE"
cat "$LOG_DIR/.entry.tmp" "$LOG_FILE" > "$LOG_FILE.new"
mv "$LOG_FILE.new" "$LOG_FILE"
rm -f "$LOG_DIR/.entry.tmp"
printf '%s\n' "$FULL_HASH" > "$MARKER"
EOF
    rm -f "$ENTRY_TMP"
  }

  trap 'on_error $LINENO' ERR

  log "➡️  Preparing staging directory on remote server: $STAGING_DIR"

  ssh "$REMOTE_USER_HOST" \
    RELEASES_DIR="$RELEASES_DIR" \
    STAGING_DIR="$STAGING_DIR" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

mkdir -p "$RELEASES_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
EOF

  log "➡️  Uploading front sources to staging (excluding node_modules/.next/out)"
  rsync -az --delete \
    --exclude ".git" \
    --exclude ".next" \
    --exclude "node_modules" \
    --exclude "out" \
    --exclude ".env.local" \
    --exclude ".env*.local" \
    --exclude ".DS_Store" \
    "$SCRIPT_DIR"/ "$REMOTE_USER_HOST:$STAGING_DIR/"

  log "➡️  Installing dependencies and building Next.js on remote server"
  ssh "$REMOTE_USER_HOST" \
    STAGING_DIR="$STAGING_DIR" \
    CURRENT_DIR="$CURRENT_DIR" \
    PM2_ECOSYSTEM_FILE="$PM2_ECOSYSTEM_FILE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

export PATH="/home/debian/.npm-global/bin:/home/debian/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin:/usr/sbin:$PATH"

cd "$STAGING_DIR"

command -v pnpm >/dev/null 2>&1 || {
  echo "❌ ERROR: pnpm is not installed on the remote server" >&2
  exit 1
}

command -v pm2 >/dev/null 2>&1 || {
  echo "❌ ERROR: pm2 is not installed on the remote server" >&2
  exit 1
}

for env_file in .env.production.local .env.production .env; do
  if [ -f "$CURRENT_DIR/$env_file" ] && [ ! -f "$STAGING_DIR/$env_file" ]; then
    cp "$CURRENT_DIR/$env_file" "$STAGING_DIR/$env_file"
  fi
done

pnpm install --frozen-lockfile
pnpm build

if [ ! -f "$PM2_ECOSYSTEM_FILE" ]; then
  echo "❌ ERROR: Missing $PM2_ECOSYSTEM_FILE in release" >&2
  exit 1
fi
EOF

  log "➡️  Performing atomic release switch (with server-side backup, keeping releases/)"

  ssh "$REMOTE_USER_HOST" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    STAGING_DIR="$STAGING_DIR" \
    WEB_ROOT_BASE="$WEB_ROOT_BASE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

cd "$WEB_ROOT_BASE"

if [ ! -d "$STAGING_DIR" ]; then
  echo "❌ ERROR: Staging directory $STAGING_DIR does not exist" >&2
  exit 1
fi

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

mkdir -p "$CURRENT_DIR"
cd "$CURRENT_DIR"

TMP_RELEASES_DIR="$WEB_ROOT_BASE/.releases_tmp_switch"

if [ -d "releases" ]; then
  rm -rf "$TMP_RELEASES_DIR"
  mv "releases" "$TMP_RELEASES_DIR"
fi

shopt -s dotglob
if compgen -G "*" > /dev/null; then
  mv * "$BACKUP_DIR"/ 2>/dev/null || true
fi
shopt -u dotglob

if [ -d "$TMP_RELEASES_DIR" ]; then
  mv "$TMP_RELEASES_DIR" "$CURRENT_DIR/releases"
fi

cp -a "$STAGING_DIR"/. "$CURRENT_DIR"/

echo "✅ New release activated from $STAGING_DIR"
EOF

  SWITCH_DONE="true"

  log "➡️  Reloading PM2 from ecosystem"
  remote_pm2_reload

  trap - ERR

  write_deploy_log || log "⚠️  Deploy changelog update skipped (non-fatal)"
  zeus_report "success" || log "⚠️  Zeus was not told about this deploy (non-fatal)"

  log "✅ Deployment completed successfully"
  log "ℹ️  Next.js app settings are read from $PM2_ECOSYSTEM_FILE"
  log "ℹ️  Previous version is available in: $BACKUP_DIR"
  log "ℹ️  All releases are stored under: $RELEASES_DIR"
  log "ℹ️  You can manually rollback with: ./deploy-front.sh rollback"
}

rollback() {
  log "↩️  Manual rollback to previous version"

  # A manual rollback is reported for the same reason an automatic one is: it changes what is live,
  # and Zeus's whole claim is to know which build each service is serving. It ships no commits — see
  # `zeus_commits_json` — and names no release, because the release it restores is whatever was in
  # the backup directory and this script never learns its name.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_REPORT_COMMITS="false"

  if remote_rollback; then
    log "➡️  Reloading PM2 from ecosystem"
    remote_pm2_reload
    zeus_report "rolled_back" "manual rollback — the previous release is live again" || true
    log "✅ Rollback completed. Previous version is now live."
  else
    log "❌ Rollback failed. Check server state manually."
    zeus_report "failed" "manual rollback failed — the box needs looking at" || true
    exit 1
  fi
}

######################################
# Script entry point
######################################

ACTION="${1:-deploy}"

case "$ACTION" in
  deploy)
    deploy
    ;;
  rollback)
    rollback
    ;;
  *)
    echo "Usage: $0 [deploy|rollback]"
    exit 1
    ;;
esac
