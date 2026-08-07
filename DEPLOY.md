# Spira deployment — ks-b

Spira is two PM2 processes behind one nginx vhost on `spira.1991computer.com`, deployed the same way as
PFA: rsync into a timestamped release directory, build on the server, atomic switch, `pm2 reload`.

| | Dev | Prod |
|---|---|---|
| Front | `localhost:3004` (`pnpm dev`) | Next server on `127.0.0.1:3004`, proxied by nginx |
| API | `/api`, rewritten to `127.0.0.1:6700` | Nest on `127.0.0.1:6700`, proxied at `/api` by nginx |
| Cookie | Same-origin | Same-origin |
| DB | local MySQL `spira` | MySQL `spira` on ks-b |
| Sessions | local Redis | Redis on ks-b, bound to localhost |

The browser only ever talks to one origin, in both environments: nginx owns `/api` in production and
`next.config.js` rewrites it in development. That is why the CSP can stay at `connect-src 'self'`
everywhere and why no `NEXT_PUBLIC_*` API host exists — one was tried and it broke `pnpm start`, because
`NODE_ENV=production` dropped the dev CSP exception and the browser blocked every call to the API's port.

## Ports

Spira's ports come from the fleet convention that Zeus's registry enforces (`Zeus/nest-api/src/registry/`):
**fronts live on `30xx`, APIs own a `6N00` block and listen on its first port.**

| Service | Port | PM2 name |
|---|---|---|
| Front | `3004` | `spira-front` |
| API | `6700` | `spira-nest-api` |

Taken elsewhere in the fleet, so do not reuse: `3000` pfa-front, `3001` hiwaysim, `3002` worldweathr-front,
`3003` zeus-front, `3100` bkmk-front¹, `6100` pfa, `6200` bkmk, `6300` conway, `6400`/`6401` 1991chat¹,
`6500` worldweathr, `6600` zeus.

¹ The two standing exceptions to the convention that Zeus's registry documents as accepted facts.

Register Spira in Zeus when its registry is live, so the next app does not have to grep for this.

## Nginx — critical configuration for the session cookie

The `spira.sid` httpOnly cookie only works if nginx forwards these headers to Nest:

```nginx
server {
  server_name spira.1991computer.com;

  location /api {
    proxy_pass http://127.0.0.1:6700;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:3004;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

- **`X-Forwarded-Proto`** is required for the `Secure` cookie to be accepted over HTTPS. Nest sets
  `trust proxy` and `session({ proxy: true })` to read it.
- **`Host`** ensures the cookie is scoped to the right domain.

## Server environment (`/var/www/spira/nest-api/.env`)

This file is **not** in git and is copied forward across releases by `deploy-api.sh`.

| Variable | Description |
|---|---|
| `PORT` | `6700` |
| `DATABASE_URL` | `mysql://spira:<password>@localhost:3306/spira` |
| `SESSION_SECRET` | 32 random bytes, base64 — `openssl rand -base64 32` |
| `REDIS_URL` | `redis://localhost:6379` |
| `FRONTEND_URL` | `https://spira.1991computer.com` — used for CORS |
| `COOKIE_SECURE` | leave unset (defaults to secure in production); set `false` only on a plain-HTTP host |

Backups (COS-441) add five more. The dump credentials are **not** among them — they are parsed out of
`DATABASE_URL`, so there is exactly one statement of how to reach the database and a rotated password
cannot leave the backup authenticating with a stale one.

| Variable | Description |
|---|---|
| `SPIRA_DUMP_PATH` | local dump directory, e.g. `/home/spira/dumps` — created if absent |
| `SPIRA_BACKUP_SERVER_PATH` | destination directory on `vps-debian` |
| `SPIRA_BACKUP_SERVER_IP` | `vps-debian`'s address |
| `DEBIAN_OVH_VPS_SSH_USER` | SSH account on `vps-debian` |
| `DEBIAN_OVH_VPS_SSH_KEY_PATH` | path to the private key on ks-b |

The last three are the same names PFA already uses, and take the same values — copy them from
`/var/www/pfa/nest-api/.env` on ks-b rather than issuing a second key for the same account.

Three optional overrides exist and should normally be left alone: `SPIRA_DUMP_BINARY` (default
`mysqldump`; MariaDB ships it as `mariadb-dump` and does not always keep the symlink),
`SPIRA_LOCAL_RETENTION_DAYS` (14) and `SPIRA_REMOTE_RETENTION_COPIES` (28).

`ecosystem.config.js` reads this file at `pm2 start/reload` time and spreads it into `env_production`, so
PM2 remains the source of `process.env` — `PrismaService` and `RedisService` read it in their constructors,
before Nest's `ConfigModule` runs.

## One-time provisioning

```bash
sudo apt install -y mariadb-server redis-server
sudo mysql -e "CREATE DATABASE spira CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'spira'@'localhost' IDENTIFIED BY '<password>'; GRANT ALL ON spira.* TO 'spira'@'localhost';"
sudo sed -i 's/^# *bind 127.0.0.1/bind 127.0.0.1/' /etc/redis/redis.conf && sudo systemctl restart redis-server
sudo mkdir -p /var/www/spira && sudo chown -R debian:debian /var/www/spira
```

Then, once the API is on the server for the first time:

```bash
cd /var/www/spira/nest-api && pnpm migrate:deploy && pnpm seed
```

The seeder prints the generated password once. There is no signup UI — this is the only way an account
comes into existence.

## Deploying

```bash
./nest-api/deploy-api.sh
```

```bash
./front/deploy-front.sh
```

Each script uploads to `…-releases/release-<timestamp>-<branch>-<hash>`, installs and builds there, then
swaps it into place and reloads PM2. A failure after the swap auto-rolls-back; a manual rollback is
`./front/deploy-front.sh rollback`.

Database migrations are not run by the deploy script — run `pnpm migrate:deploy` on the server yourself
when a release carries one, so a schema change is never an accident of a routine deploy.

## Backups

The API backs itself up. `DbBackupCronService` runs on `@Cron("0 0 */12 * * *")` — midnight and noon
UTC — dumps the `spira` database, gzips it, and copies it to `vps-debian` over SFTP.

The schedule lives in the app process rather than in cron because **ks-b has no cron daemon**:
`crontab` is not even installed. This file previously carried two crontab lines that were never
installed anywhere and could not have been, and Spira consequently had no backup at all until
COS-441. PFA and bkmk schedule theirs the same way, for the same reason.

| | Path | Retention |
|---|---|---|
| Local | `$SPIRA_DUMP_PATH/spira-<ISO minute>.sql.gz` | 14 days, pruned by mtime |
| Off-server | `vps-debian:$SPIRA_BACKUP_SERVER_PATH/` | newest 28 generations (14 days × 2) |

Both legs are kept: the local copy is the cheap restore, the off-server copy is the one that survives
losing ks-b. Unlike PFA — which overwrites a single `pfadump.sql` — each run ships a **new dated file**,
so one dump that succeeds while corrupt cannot destroy the last good copy.

The job is inert unless `NODE_ENV=production`, so a dev machine never dumps or connects out. When a
required variable is missing it logs `DB backup skipped — missing config: <names>` and does nothing —
it never half-runs. A dump that fails, or comes back under 1 KB, is deleted rather than shipped.

### Verifying it works

Backups fail silently by nature — nobody notices until a restore. Check the log after the first
midnight or noon:

```bash
pm2 logs spira-nest-api --lines 200 --nostream | grep -i -E 'backup|dump'
```

Expect `Dumped spira → …` with a byte count, then `Backup copy OK: …`. A dump whose size drops by an
order of magnitude is a broken backup that looks exactly like a working one — the byte count is logged
on every run so that shows up.

To prove the whole path without waiting for a scheduled run, restore the newest off-server dump into a
scratch database:

```bash
ssh vps-debian 'ls -la <SPIRA_BACKUP_SERVER_PATH>'
```

## If it works in dev but not in prod

1. **Check the cookie in DevTools**: Network → `POST /api/users/login` → Response Headers → is `Set-Cookie` there?
2. **No `Set-Cookie`**: Nest or proxy side — a forwarded header is missing.
3. **`Set-Cookie` present but not stored**: `Secure` on an HTTP origin → set `COOKIE_SECURE=false`.
4. **Cookie stored but 401s**: the request is not sending credentials — every call goes through
   `useRequestHelper` or `serverFetch`, both of which do.
5. **403 on every write**: the CSRF token is stale. The client refetches `/api/users/csrf` and replays once
   automatically; a persistent 403 means the session and the token have diverged — sign out and back in.
