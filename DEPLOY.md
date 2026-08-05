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

```bash
# Nightly, retained 14 days, plus an off-server copy.
0 3 * * * mysqldump --single-transaction spira | gzip > /home/spira/dumps/spira-$(date +\%F).sql.gz
5 3 * * * find /home/spira/dumps -name 'spira-*.sql.gz' -mtime +14 -delete
```

## If it works in dev but not in prod

1. **Check the cookie in DevTools**: Network → `POST /api/users/login` → Response Headers → is `Set-Cookie` there?
2. **No `Set-Cookie`**: Nest or proxy side — a forwarded header is missing.
3. **`Set-Cookie` present but not stored**: `Secure` on an HTTP origin → set `COOKIE_SECURE=false`.
4. **Cookie stored but 401s**: the request is not sending credentials — every call goes through
   `useRequestHelper` or `serverFetch`, both of which do.
5. **403 on every write**: the CSRF token is stale. The client refetches `/api/users/csrf` and replays once
   automatically; a persistent 403 means the session and the token have diverged — sign out and back in.
