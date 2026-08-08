# Spira

A self-hosted ticketing app that replaces Linear. Per-project ticket prefixes
(`PFA-12`, `3DE-2`, `SPI-24`) instead of one workspace-wide counter, and every legacy `COS-xxx`
identifier keeps resolving — hundreds of them live in commit messages that will never be rewritten.

Accounts each own a private workspace: no sharing, no roles, no invites, but no cap either — a
throwaway account with demo data can sit beside the real one in the same database without either
seeing the other.

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

There is no signup screen; the seeder is the only way an account comes into existence — but you can
run it as often as you like, and each `--username` gets a workspace of its own. Locally, pass a
credential you can retype — Chrome will not offer to save one for `http://localhost`. Omit `--password`
and it mints a random one and prints it once, which is what you want on the server.

Add `--empty` for an account with no demo data, which is what a workspace awaiting the Linear import
wants.

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

## Importing from Linear

The cutover import runs from **Settings → Import from Linear**: pick the CSV export, read the dry
run, type `import`. Nothing is written until that second step, and the commit refuses any file whose
report you have not just read.

The same import is a CLI, for a large export or a server with no app running yet:

```bash
cd nest-api && pnpm import:linear -- <export.csv> --username <account> --skip-orphans
```

Both go through `nest-api/src/migration`, so they cannot disagree. See
[nest-api/scripts/import-guide.md](nest-api/scripts/import-guide.md).

## Icons

Project and saved-view icons are Material Symbols ligature names or single emoji, and the picker
searches a generated index of both — 3,896 glyphs and 1,906 emoji, committed under
`front/src/lib/icons`. It is code-split, so it downloads the first time somebody opens the picker
and never on a page load.

Regenerate it only on purpose — it pins the icon set, and a name that stops existing is a project
whose icon stops drawing:

```bash
cd front && pnpm icons:generate
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
