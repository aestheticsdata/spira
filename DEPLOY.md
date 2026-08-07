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

## Zeus registration

Spira is registered in Zeus's port registry as one app with two services. This is data entry in
Zeus's UI, not a code change — the registry is a pair of database tables, and `Service.port` is
UNIQUE, so a collision is impossible to save rather than merely discouraged.

App:

| Field | Value |
|---|---|
| name | `spira` — also what `ZEUS_APP_NAME` must be set to |
| displayName | `Spira` |
| apiBlock | `6700` |
| dbName | `spira` |

Services:

| Field | Front | API |
|---|---|---|
| role | `front` | `api` |
| port | `3004` | `6700` |
| block | — | `6700` |
| pm2Name | `spira-front` | `spira-nest-api` |
| nginxLocation | `spira.1991computer.com /` | `spira.1991computer.com /api/` |
| nginxConfPath | `/etc/nginx/conf.d/spira.conf` | `/etc/nginx/conf.d/spira.conf` |
| ecosystemPath | `/var/www/spira/public_html/ecosystem.config.cjs` | `/var/www/spira/ecosystem.config.js` |
| healthUrl | `https://spira.1991computer.com/` | `https://spira.1991computer.com/api/health` |

Both ports follow the convention, so neither service needs a `conventionNote`.

The two services share one vhost, as pfa's do — `grep -rl '127.0.0.1:3004\|127.0.0.1:6700' /etc/nginx`
on ks-b returns that one file and nothing else. It is worth having checked rather than assumed:
`nginxConfPath` is the file a port reassignment rewrites, the riskiest write Zeus makes, and the
fleet does not reliably name these after the app — conway's lives inside the shared apex vhost.

**Register before deploying the cron reporting below.** Zeus creates a cron row by itself the first
time one reports, but never an app: a report naming an app the registry has never heard of is a
`400`, and nothing on Spira's side surfaces that — `withZeusReport` swallows every non-2xx by
design. In the wrong order the backup looks reported and is not.

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

## Server environment (`nest-api/ecosystem.config.js`)

PM2 owns `process.env`, and the values live as literals in `nest-api/ecosystem.config.js` — which is
**gitignored and kept on your machine**, with `ecosystem.config.example.js` as the template in git.
`deploy-api.sh` scp's it to `/var/www/spira/ecosystem.config.js` on every deploy, so the server copy
is never hand-edited and no credential ever reaches git. pfa, bkmk and zeus all work this way.

PM2 being the source matters because `PrismaService` and `RedisService` read `process.env` in their
constructors, before Nest's `ConfigModule` runs.

The server's `nest-api/.env` still exists and is still carried forward across releases, but the API
no longer reads it — the ecosystem file's values win. Editing it on ks-b changes nothing.

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
| `SPIRA_DUMP_PATH` | local dump directory, `/home/spira/mysqldump/` — must exist, see Backups |
| `SPIRA_BACKUP_SERVER_PATH` | destination directory on `vps-debian` |
| `SPIRA_BACKUP_SERVER_IP` | `vps-debian`'s address |
| `DEBIAN_OVH_VPS_SSH_USER` | SSH account on `vps-debian` |
| `DEBIAN_OVH_VPS_SSH_KEY_PATH` | path to the private key on ks-b |

The last three are the same names PFA already uses, and take the same values — copy them from
`/var/www/pfa/apiserver/ecosystem.config.js` on ks-b rather than issuing a second key for the same
account.

Three optional overrides exist and should normally be left alone: `SPIRA_DUMP_BINARY` (default
`mysqldump`; MariaDB ships it as `mariadb-dump` and does not always keep the symlink),
`SPIRA_LOCAL_RETENTION_DAYS` (14) and `SPIRA_REMOTE_RETENTION_COPIES` (28).

Zeus cron reporting (COS-447) adds three more. Leave `ZEUS_INGEST_TOKEN` or `ZEUS_APP_NAME` unset and
the client is a silent no-op — which is what makes the API run identically on a laptop.

| Variable | Description |
|---|---|
| `ZEUS_INGEST_URL` | `http://127.0.0.1:6600/api/cron-runs` |
| `ZEUS_INGEST_TOKEN` | the same value as Zeus's own — copy it from `/var/www/zeus/nest-api/ecosystem.config.js` |
| `ZEUS_APP_NAME` | `spira`, Spira's slug in Zeus's port registry — **which must exist first**, see Zeus registration |

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
export PATH="$HOME/.local/share/pnpm:$PATH"   # pnpm is not on a non-interactive PATH
cd /var/www/spira/nest-api && pnpm migrate:deploy && pnpm seed -- --username cosmokaat@protonmail.com --empty
```

The seeder prints the generated password once. There is no signup UI — running the seeder is the only
way an account comes into existence — but there is no cap on how many accounts a database holds
(COS-457): each owns a private workspace, and seeding a second one leaves the first untouched.

`--empty` creates the account and the shared workflow states without the demo projects and issues,
which is what production wants: the demo data would otherwise have to be deleted again before the
Linear import could run. Drop the flag to get the demo workspace on a scratch box.

### The demo account

Production also carries a second, throwaway account holding the demo workspace, so the deployed app
can be clicked around without touching real tickets:

```bash
pnpm seed -- --username dragon@ultrasecure.com
```

No `--empty` here — the demo data is the entire point of this one. It is the same mock identity the
other fleet apps use, which is why it is not named after Spira.

**Give it a real password.** Omitting `--password` mints a random 20-character one and prints it
once, which is what you want: this is a login on a public host, and Spira's rate limiter (five
attempts, then an exponential lockout) buys time against a weak password rather than excusing one.

Its workspace is invisible to the real account and vice versa — the isolation is enforced per query,
not by convention (COS-457) — so the only thing this account costs is one more credential to keep.

### Login address vs. displayed name

The login **is** the email: `cosmokaat@protonmail.com`, `dragon@ultrasecure.com`. The app displays
only the local part — `cosmokaat`, `dragon` — in the sidebar's user menu and on the settings page,
with the full address shown inside the menu and under the account name, since that is the credential.
Nothing stores the two separately; `displayName()` in `front/src/lib/account.ts` derives one from the
other, and a bare username with no `@` (local dev's `joe`) simply displays as itself.

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

The local dump directory must exist and be writable by `debian`, matching `/home/pfa/mysqldump`:

```bash
sudo mkdir -p /home/spira/mysqldump && sudo chown -R debian:debian /home/spira
```

Without it the job fails with `EACCES: permission denied, mkdir '/home/spira'` — at midnight, into a
log nobody is reading. The **remote** directory needs no such step: `SshBackupService` creates it
recursively before every put.

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

### Reported to Zeus

The job reports every run to Zeus's `/cron` (COS-447), which is the part that makes a failure
visible to someone who is not reading `pm2 logs`:

| On Zeus | When |
|---|---|
| `ok` | dumped and shipped off-box; `detail.bytes` carries the size |
| `skipped` | a required variable is unset — the summary names which ones |
| `failed` | the dump errored, **or** it succeeded but the SSH config is incomplete so nothing left ks-b |

That last row is deliberate. A dump sitting on the box you have lost is not a backup, so a local-only
run is red rather than green with a footnote — `detail.offBox` says which happened.

Reporting can never break the backup: the client swallows every network error, timeout and non-2xx,
takes 2 seconds at most and never retries. The cost is that a rejected report is invisible here,
which is the whole reason the registry entry has to exist first.

The reported schedule is the same `BACKUP_SCHEDULE` constant the scheduler runs on, so Zeus's
"overdue" detection cannot be defeated by the two drifting apart. No timezone is reported, because
the `@Cron` pins none and therefore fires in the process's zone — UTC on ks-b, which is what Zeus
assumes by default.

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
