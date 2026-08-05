# Spira

A self-hosted, single-user ticketing app that replaces Linear. Per-project ticket prefixes
(`PFA-12`, `3DE-2`, `SPI-24`) instead of one workspace-wide counter, and every legacy `COS-xxx`
identifier keeps resolving — hundreds of them live in commit messages that will never be rewritten.

The UI deliberately copies Linear's, because it works and because this is a personal tool.

## Shape

```
front/      Next.js 16 · App Router · React 19 · Tailwind v4 · shadcn · Biome
nest-api/   NestJS 11 · Prisma 7 · MySQL · Redis sessions · ESLint + Prettier
docs/       the design spec and the API contract
design_handoff_spira/   the Claude Design source the UI is built from
```

Reads and writes both go through the API. The front holds no database credentials: Server Components
call the Nest API with the browser's session cookie forwarded, and the API is the only place that
authorises anything.

## Running it locally

Needs MySQL and Redis on their default ports.

```bash
mysql -uroot -p -e "CREATE DATABASE spira CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

```bash
cd nest-api && cp .env.example .env && pnpm install && pnpm migrate:dev && pnpm seed -- --username joe --password azerty
```

There is no signup screen; the seeder is the only way an account comes into existence. Locally, pass a
credential you can retype — Chrome will not offer to save one for `http://localhost`. Omit `--password`
and it mints a random one and prints it once, which is what you want on the server.

Then:

```bash
cd nest-api && pnpm start:dev
```

```bash
cd front && cp .env.example .env.local && pnpm install && pnpm dev
```

The front is on `http://localhost:3004`, the API on `http://localhost:6700`.

## Checks

```bash
cd nest-api && pnpm lint && pnpm test
```

```bash
cd front && pnpm lint && pnpm test
```

## Deploying

See [DEPLOY.md](DEPLOY.md). Two PM2 processes behind one nginx vhost on `spira.1991computer.com`.

```bash
./nest-api/deploy-api.sh
```

```bash
./front/deploy-front.sh
```

## Not in v1

Board layout, drag & drop, comments, activity history, keyboard shortcuts beyond `/`, milestones,
cycles, attachments, assignees, estimates, multi-user. Deliberately — see
[docs/specs/2026-07-29-spira-design.md](docs/specs/2026-07-29-spira-design.md) §2.

Still to come, in order: the Linear CSV importer, saved views, API tokens and the MCP connector.
