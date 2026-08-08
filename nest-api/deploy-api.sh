#!/usr/bin/env bash
set -Eeuo pipefail

######################################
# Configuration
######################################
REMOTE_USER_HOST="debian@ks-b"

# Base dir for the API on the server
API_ROOT="/var/www/spira"

# Paths on the server
NEST_DIR="$API_ROOT/nest-api"
NEST_BACKUP_DIR="$API_ROOT/nest-api.bak"
NEST_RELEASES_DIR="$API_ROOT/nest-api-releases"

# Local project dir (= nest-api/, where this script now lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# pm2 app name, and the key the migration step looks under to find the production
# DATABASE_URL in the server's ecosystem.config.js.
PM2_APP_NAME="spira-nest-api"

######################################
# Reporting to Zeus (COS-459)
######################################
# Spira's slug in Zeus's port registry, and which half of it this script deploys. Zeus refuses a
# report naming an app the registry has never heard of; an unregistered *role* it records with a
# warning instead, because that means the registry is behind the box and dropping it would hide
# exactly that.
ZEUS_APP_NAME="${ZEUS_APP_NAME:-spira}"
ZEUS_ROLE="api"

# The two files **on ks-b** that may hold the ingest URL and the shared secret, in the order the API
# itself resolves them — see `read_setting` in `zeus_report`.
#
# Read there rather than carried on the laptop, for two reasons. The secret never travels: it is
# read on the box, used on the box, and never appears in an ssh command line where `ps` would show
# it. And the endpoint is loopback-only — a report has to be sent from ks-b whatever happens,
# because this script runs on a laptop that Zeus's nginx would refuse.
ZEUS_ECOSYSTEM_FILE="${ZEUS_ECOSYSTEM_FILE:-$API_ROOT/ecosystem.config.js}"
ZEUS_ENV_FILE="${ZEUS_ENV_FILE:-$NEST_DIR/.env}"

# The served changelog and the marker holding the last deployed commit. Hoisted out of
# `write_deploy_log` because the report to Zeus measures its commit range from the same marker, and
# two independent resolutions of the same baseline is how they drift apart.
DEPLOY_LOG_DIR="$API_ROOT/deploy-logs"
DEPLOY_LOG_FILE="$DEPLOY_LOG_DIR/deploys-$ZEUS_ROLE.txt"
DEPLOY_MARKER="$DEPLOY_LOG_DIR/.last-$ZEUS_ROLE"

# Load DATABASE_URL from nest-api/.env. This is the *laptop's* development database,
# and it is here only because `prisma generate` refuses to run without the variable
# set — nothing in the build ever connects with it. It deliberately does not reach
# `migrate deploy`, which reads the production URL off the server (COS-460).
NEST_ENV="$SCRIPT_DIR/.env"
if [ -f "$NEST_ENV" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$NEST_ENV"
  set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL is not set. Required for Nest/Prisma build." >&2
  echo "   Add it to nest-api/.env or run: export DATABASE_URL='mysql://...'" >&2
  exit 1
fi

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

# Remote rollback helper (used by manual and auto rollback)
remote_rollback() {
  ssh "$REMOTE_USER_HOST" \
    NEST_DIR="$NEST_DIR" \
    NEST_BACKUP_DIR="$NEST_BACKUP_DIR" \
    API_ROOT="$API_ROOT" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

cd "$API_ROOT"

if [ ! -d "$NEST_BACKUP_DIR" ]; then
  echo "❌ ERROR: Backup directory not found" >&2
  exit 1
fi

rm -rf "$NEST_DIR"
mv "$NEST_BACKUP_DIR" "$NEST_DIR"

echo "✅ API rollback done on server (restored from backup)"
EOF
}

deploy() {
  cd "$SCRIPT_DIR"

  ######################################
  # Git metadata for release naming
  ######################################

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
  local NEST_RELEASE_REMOTE="$NEST_RELEASES_DIR/$RELEASE_NAME"
  local SWITCH_DONE="false"

  # Current live API commit, read from the newest release folder name (…-<hash>) before this
  # deploy's own folder is created. Seeds the commit range on the very first run, when no marker
  # exists yet. Non-fatal: an empty value falls back to the last-10 baseline.
  #
  # `write_deploy_log` has always read this variable and nothing ever set it, so the fallback was
  # dead; deploy-front.sh set it correctly all along. Fixed here because the report to Zeus depends
  # on the same baseline (COS-459).
  local PREV_FROM_SERVER
  PREV_FROM_SERVER=$(ssh "$REMOTE_USER_HOST" "ls -1 '$NEST_RELEASES_DIR' 2>/dev/null | sort | tail -1" 2>/dev/null \
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

  ######################################
  # Error handler (rollback if needed)
  ######################################
  on_error() {
    local lineno=$1
    log "❌ ERROR: API deployment failed at line $lineno"

    if [[ "$SWITCH_DONE" == "true" ]]; then
      log "↩️  Auto rollback: switching API back to previous version"
      if remote_rollback; then
        log "✅ Auto rollback succeeded"
        log "➡️  Reloading API with pm2 after rollback"
        restart_pm2
        log "⚠️  Code only — the database was not rolled back. Prisma has no down-"
        log "    migrations, so any migration this deploy applied is still applied."
        # `rolled_back`, not `failed`, and the distinction is the whole reason Zeus has three
        # statuses: the deploy did fail, and the box is serving exactly what it served before.
        zeus_report "rolled_back" "deploy failed at line $lineno — previous release restored" || true
      else
        log "❌ Auto rollback failed, manual intervention required"
        zeus_report "failed" "deploy failed at line $lineno — rollback failed too" || true
      fi
    else
      log "ℹ️  No rollback needed: API production was not modified yet"
      zeus_report "failed" "deploy failed at line $lineno — production was not modified" || true
    fi
  }

  restart_pm2() {
    ssh "$REMOTE_USER_HOST" \
      API_ROOT="$API_ROOT" \
      'bash -s' << 'EOF'
set -Eeuo pipefail
cd "$API_ROOT"
pm2 reload ecosystem.config.js --env production 2>/dev/null || pm2 start ecosystem.config.js --env production
EOF
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

  ######################################
  # Remote: prepare release directory
  ######################################
  log "➡️  Preparing release directory on server"

  ssh "$REMOTE_USER_HOST" \
    NEST_RELEASES_DIR="$NEST_RELEASES_DIR" \
    NEST_RELEASE_REMOTE="$NEST_RELEASE_REMOTE" \
    API_ROOT="$API_ROOT" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

mkdir -p "$API_ROOT"
mkdir -p "$NEST_RELEASES_DIR"

rm -rf "$NEST_RELEASE_REMOTE"
mkdir -p "$NEST_RELEASE_REMOTE"
EOF

  ######################################
  # Rsync Nest API
  ######################################
  log "➡️  Syncing Nest API source to release directory (rsync)"

  rsync -az \
    --delete \
    --exclude=".git" \
    --exclude="node_modules" \
    --exclude="dist" \
    --exclude=".DS_Store" \
    --exclude="prisma.config.js" \
    --exclude="prisma.config.js.map" \
    --exclude="prisma.config.d.ts" \
    --exclude="deploy-api.sh" \
    --exclude="ecosystem.config.js" \
    "$SCRIPT_DIR/" \
    "$REMOTE_USER_HOST":"$NEST_RELEASE_REMOTE/"

  ######################################
  # Rsync ecosystem.config.js
  ######################################
  # Gitignored and kept on this machine, the way Zeus, PFA and bkmk all do it: it holds
  # the process env as literals — including the vps-debian credentials the backup job
  # needs — so it must never reach git, and scp'ing it here means the server copy is
  # never hand-edited either. Start a fresh one from ecosystem.config.example.js.
  log "➡️  Syncing ecosystem.config.js"

  scp "$SCRIPT_DIR/ecosystem.config.js" "$REMOTE_USER_HOST:$API_ROOT/ecosystem.config.js"

  ######################################
  # Carry forward the server .env
  ######################################
  # Not in git, not in the rsync source — it only ever exists on the server. Copy
  # it from the still-live directory into the new release before the swap below
  # replaces that directory, the same way deploy-front.sh already does.
  log "➡️  Carrying forward the server .env, if one exists"

  ssh "$REMOTE_USER_HOST" \
    NEST_DIR="$NEST_DIR" \
    NEST_RELEASE_REMOTE="$NEST_RELEASE_REMOTE" \
    'bash -s' << 'EOF'
set -Eeuo pipefail
if [ -f "$NEST_DIR/.env" ] && [ ! -f "$NEST_RELEASE_REMOTE/.env" ]; then
  cp "$NEST_DIR/.env" "$NEST_RELEASE_REMOTE/.env"
fi
EOF

  ######################################
  # Switch current ↔ backup (atomic)
  ######################################
  log "➡️  Performing atomic API release switch with backup"

  ssh "$REMOTE_USER_HOST" \
    NEST_DIR="$NEST_DIR" \
    NEST_BACKUP_DIR="$NEST_BACKUP_DIR" \
    NEST_RELEASE_REMOTE="$NEST_RELEASE_REMOTE" \
    API_ROOT="$API_ROOT" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

cd "$API_ROOT"

if [ ! -d "$NEST_RELEASE_REMOTE" ]; then
  echo "❌ ERROR: Release directory does not exist" >&2
  exit 1
fi

if [ ! -f "$NEST_RELEASE_REMOTE/package.json" ]; then
  echo "❌ ERROR: Nest release is empty (no package.json in $NEST_RELEASE_REMOTE)" >&2
  exit 1
fi

rm -rf "$NEST_BACKUP_DIR"

if [ -d "$NEST_DIR" ]; then
  mv "$NEST_DIR" "$NEST_BACKUP_DIR"
fi

mv "$NEST_RELEASE_REMOTE" "$NEST_DIR"

echo "✅ New API release activated"
EOF

  SWITCH_DONE="true"

  ######################################
  # Fresh install + build
  ######################################
  log "➡️  Installing dependencies and building on server"

  ssh "$REMOTE_USER_HOST" \
    NEST_DIR="$NEST_DIR" \
    DATABASE_URL="$DATABASE_URL" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

export PATH="$HOME/.local/share/pnpm:$PATH"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ pnpm is not installed on this server (required for API deploy)" >&2
  exit 1
fi

# Nest: install + build. DATABASE_URL is exported only because `prisma generate`
# demands the variable exist — it is the dev URL, and generate never connects.
cd "$NEST_DIR"
rm -rf node_modules dist
pnpm install
export DATABASE_URL
pnpm build
EOF

  ######################################
  # Database migrations
  ######################################
  # After install, because the prisma CLI is a devDependency; after build, so a
  # broken build fails before the schema moves; and before the pm2 reload below,
  # because the new code coming up onto an already-migrated schema is the point.
  #
  # This does not make the deploy seamless, and the honest version is worth
  # writing down: between this step and the reload finishing, the *old* process
  # is serving against the *new* schema. That is a few seconds, and it is benign
  # for the additive migrations that are the common case — an added column the
  # old client does not select. A destructive one (drop, rename) will throw for
  # the length of the reload. There is no ordering that avoids both directions
  # without downtime; this is the one whose common case is harmless, and it
  # replaces a window that used to last until somebody remembered.
  #
  # A failure here exits non-zero inside the ERR trap, so on_error rolls the
  # release back and pm2 is never reloaded: the previous release stays up on the
  # schema it was written against. (COS-460)
  log "➡️  Applying database migrations"

  ssh "$REMOTE_USER_HOST" \
    NEST_DIR="$NEST_DIR" \
    ECOSYSTEM_REMOTE="$API_ROOT/ecosystem.config.js" \
    PM2_APP_NAME="$PM2_APP_NAME" \
    'bash -s' << 'EOF'
set -Eeuo pipefail

export PATH="$HOME/.local/share/pnpm:$PATH"

# The production URL comes out of the pm2 ecosystem file and from nowhere else.
# Both nearby candidates are wrong: the deploy script's own DATABASE_URL is the
# laptop's dev database, and $NEST_DIR/.env is the server's old env carried
# forward into the release — a file the API itself no longer reads.
PROD_DATABASE_URL=$(node -p \
  'const c = require(process.env.ECOSYSTEM_REMOTE); const a = (c.apps || []).find(x => x.name === process.env.PM2_APP_NAME); (a && a.env_production && a.env_production.DATABASE_URL) || ""' || true)

if [ -z "$PROD_DATABASE_URL" ]; then
  echo "❌ ERROR: no env_production.DATABASE_URL for pm2 app '$PM2_APP_NAME' in $ECOSYSTEM_REMOTE" >&2
  echo "   Refusing to migrate rather than falling back to a URL that may point elsewhere." >&2
  exit 1
fi

cd "$NEST_DIR"

# Passed in the command's environment, never on its command line: the URL carries
# the database password and `ps` shows arguments. prisma.config.ts pulls in dotenv,
# which does not override an already-set variable, so this beats the release .env.
if ! DATABASE_URL="$PROD_DATABASE_URL" pnpm migrate:deploy; then
  echo "❌ ERROR: prisma migrate deploy failed — pm2 will not be reloaded" >&2
  echo "   A migration that failed partway is recorded as failed in _prisma_migrations" >&2
  echo "   and blocks every later deploy until it is resolved on the server:" >&2
  echo "     cd $NEST_DIR && pnpm prisma migrate resolve --rolled-back <migration_name>" >&2
  exit 1
fi
EOF

  ######################################
  # Restart via pm2
  ######################################
  log "➡️  Reloading API with pm2"

  restart_pm2

  trap - ERR

  write_deploy_log || log "⚠️  Deploy changelog update skipped (non-fatal)"
  zeus_report "success" || log "⚠️  Zeus was not told about this deploy (non-fatal)"

  log "✅ API deployment completed successfully"
  log "ℹ️  Nest API (port 6700) is running"
  log "ℹ️  Previous version is available in: $NEST_BACKUP_DIR"
  log "ℹ️  You can manually rollback with: ./deploy-api.sh rollback (code only, not schema)"
}

rollback() {
  log "↩️  Manual rollback to previous API version"

  # A manual rollback is reported for the same reason an automatic one is: it changes what is live,
  # and Zeus's whole claim is to know which build each service is serving. It ships no commits — see
  # `zeus_commits_json` — and names no release, because the release it restores is whatever was in
  # the backup directory and this script never learns its name.
  ZEUS_STARTED_AT=$(date -u +%FT%TZ)
  ZEUS_STARTED_EPOCH=$(date +%s)
  ZEUS_REPORT_COMMITS="false"

  if remote_rollback; then
    log "➡️  Reloading API with pm2 after rollback"
    ssh "$REMOTE_USER_HOST" \
      API_ROOT="$API_ROOT" \
      'bash -s' << 'EOF'
set -Eeuo pipefail
cd "$API_ROOT"
pm2 reload ecosystem.config.js --env production 2>/dev/null || pm2 start ecosystem.config.js --env production
EOF
    zeus_report "rolled_back" "manual rollback — the previous release is live again" || true
    log "✅ Manual API rollback completed. Previous version is now live."
    log "⚠️  This restores code, not schema. Prisma has no down-migrations, so a"
    log "    migration applied by the deploy you just undid is still applied. If the"
    log "    restored code cannot run against it, roll forward instead of back."
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
