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
      else
        log "❌ Auto rollback failed, manual intervention required"
      fi
    else
      log "ℹ️  No rollback needed: API production was not modified yet"
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
    local APP="api"
    local LOG_DIR="$API_ROOT/deploy-logs"
    local LOG_FILE="$LOG_DIR/deploys-$APP.txt"
    local MARKER="$LOG_DIR/.last-$APP"
    local FULL_HASH WHEN PREV_HASH TICKETS COMMITS ENTRY_TMP
    local -a RANGE
    FULL_HASH=$(git rev-parse HEAD)
    WHEN=$(date +'%Y-%m-%d %H:%M:%S')

    # Resolve the range base (previous deployed commit). Only used when no marker exists yet.
    # Order: marker (steady state) -> SPIRA_SINCE override -> per-app server hint -> last-10 baseline.
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

  log "✅ API deployment completed successfully"
  log "ℹ️  Nest API (port 6700) is running"
  log "ℹ️  Previous version is available in: $NEST_BACKUP_DIR"
  log "ℹ️  You can manually rollback with: ./deploy-api.sh rollback (code only, not schema)"
}

rollback() {
    log "↩️  Manual rollback to previous API version"
  if remote_rollback; then
    log "➡️  Reloading API with pm2 after rollback"
    ssh "$REMOTE_USER_HOST" \
      API_ROOT="$API_ROOT" \
      'bash -s' << 'EOF'
set -Eeuo pipefail
cd "$API_ROOT"
pm2 reload ecosystem.config.js --env production 2>/dev/null || pm2 start ecosystem.config.js --env production
EOF
    log "✅ Manual API rollback completed. Previous version is now live."
    log "⚠️  This restores code, not schema. Prisma has no down-migrations, so a"
    log "    migration applied by the deploy you just undid is still applied. If the"
    log "    restored code cannot run against it, roll forward instead of back."
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
