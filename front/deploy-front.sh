#!/usr/bin/env bash
set -Eeuo pipefail

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
# Utility functions
######################################

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
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

  on_error() {
    local lineno=$1
    log "❌ ERROR: Deployment failed at line $lineno"

    if [[ "$SWITCH_DONE" == "true" ]]; then
      log "↩️  Auto rollback: switching back to previous version"
      if remote_rollback; then
        remote_pm2_reload || true
        log "✅ Auto rollback succeeded"
      else
        log "❌ Auto rollback failed, manual intervention required"
      fi
    else
      log "ℹ️  No rollback needed: production was not modified yet"
    fi
  }

  # Prepend this deploy's commits (+ Linear tickets) to the served changelog.
  # Always invoked as `write_deploy_log || log ...`, so errexit is ignored throughout:
  # a changelog hiccup can never fail or roll back an otherwise successful deploy.
  write_deploy_log() {
    local APP="front"
    local LOG_DIR="$WEB_ROOT_BASE/deploy-logs"
    local LOG_FILE="$LOG_DIR/deploys-$APP.txt"
    local MARKER="$LOG_DIR/.last-$APP"
    local FULL_HASH WHEN PREV_HASH TICKETS COMMITS ENTRY_TMP
    local -a RANGE
    FULL_HASH=$(git rev-parse HEAD)
    WHEN=$(date +'%Y-%m-%d %H:%M:%S')

    # Resolve the range base (previous deployed commit). Only used when no marker exists yet.
    # Order: marker (steady state) -> SPIRA_SINCE override -> newest release folder hash -> last-10 baseline.
    PREV_HASH=$(ssh "$REMOTE_USER_HOST" "cat '$MARKER' 2>/dev/null || true")
    [ -z "$PREV_HASH" ] && PREV_HASH="${SPIRA_SINCE:-}"
    [ -z "$PREV_HASH" ] && PREV_HASH="${PREV_FROM_SERVER:-}"
    if [ -n "$PREV_HASH" ] && ! git cat-file -e "${PREV_HASH}^{commit}" 2>/dev/null; then
      PREV_HASH=""
    fi
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

  log "✅ Deployment completed successfully"
  log "ℹ️  Next.js app settings are read from $PM2_ECOSYSTEM_FILE"
  log "ℹ️  Previous version is available in: $BACKUP_DIR"
  log "ℹ️  All releases are stored under: $RELEASES_DIR"
  log "ℹ️  You can manually rollback with: ./deploy-front.sh rollback"
}

rollback() {
  log "↩️  Manual rollback to previous version"
  if remote_rollback; then
    log "➡️  Reloading PM2 from ecosystem"
    remote_pm2_reload
    log "✅ Rollback completed. Previous version is now live."
  else
    log "❌ Rollback failed. Check server state manually."
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
