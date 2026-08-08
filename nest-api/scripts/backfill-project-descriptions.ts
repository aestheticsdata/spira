/**
 * Backfills the project summaries and descriptions the Linear CSV never carried (SPI-61).
 *
 *   pnpm backfill:project-descriptions -- [<projects.json>] [--commit] [--api <url>]
 *
 * The CSV export is issue-level: it has a `Description` per row, and for
 * projects nothing but `Project ID` and `Project`. So M2 could not have
 * imported project descriptions — there was no column to read them from — and
 * every project landed in Spira with an empty summary and description. They
 * were pulled from the Linear API instead and committed as
 * `linear-export/projects.json`, which is what this reads.
 *
 * **Nothing is written without `--commit`**, same rule as the importer.
 *
 * Unlike `seed.ts` and `import-linear.ts` this goes through the REST API with a
 * PAT rather than straight at Prisma, because the database it has to reach
 * lives on ks-b and the six rows it touches are not worth a deploy to get at.
 * The same invocation fills a local Spira by pointing `--api` at it.
 *
 * Idempotent, and refuses to clobber: a project that already holds text keeps
 * it unless `--force` is given. Re-running after someone has edited a
 * description in Spira must not quietly put Linear's version back.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Where the record lives when no path is given — the file sits beside the CSV it completes. */
const DEFAULT_FILE = resolve(__dirname, "..", "..", "linear-export", "projects.json");
const DEFAULT_API = "https://spira.1991computer.com/api";

// --------------------------------------------------------------------------
// The record
// --------------------------------------------------------------------------
interface LinearProject {
  /** The Spira project these rows were imported under, or null for one nothing points at. */
  spiraKey: string | null;
  linearId: string;
  name: string;
  url: string;
  trashed: boolean;
  summary: string;
  description: string;
}

/**
 * Linear wraps a cross-reference in `<issue id=… href=…>COS-18</issue>`. Spira's
 * renderer makes a chip out of the bare identifier and drops unknown tags, so
 * the markup would render correctly either way — but storing another tracker's
 * HTML in a markdown column is not what the field is for, and `COS-18` still
 * resolves through the legacy identifier.
 */
export function stripLinearMarkup(description: string): string {
  return description.replace(/<issue\b[^>]*>([\s\S]*?)<\/issue>/gi, "$1");
}

/** `summary` is a VARCHAR(255); a longer one is a truncation waiting to happen. */
const SUMMARY_MAX = 255;

function readRecord(file: string): LinearProject[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const projects = (parsed as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) {
    throw new Error(`${file} has no "projects" array.`);
  }
  return projects as LinearProject[];
}

// --------------------------------------------------------------------------
// The API
// --------------------------------------------------------------------------
interface ProjectDto {
  key: string;
  name: string;
  summary: string | null;
  description: string | null;
}

class ApiError extends Error {}

async function call<T>(api: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new ApiError(`${init?.method ?? "GET"} ${path} → ${response.status}: ${body.slice(0, 300)}`);
  }
  return body ? (JSON.parse(body) as T) : (undefined as T);
}

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------
class UsageError extends Error {}

interface BackfillOptions {
  file: string;
  api: string;
  commit: boolean;
  force: boolean;
}

const USAGE = `Usage: pnpm backfill:project-descriptions -- [<projects.json>] [--commit]

  <projects.json>       The Linear project record. Defaults to
                        linear-export/projects.json.
  --commit              Actually write. Without it this is a dry run and nothing
                        is sent but the reads.
  --api <url>           The Spira API to fill. Defaults to ${DEFAULT_API}.
                        Point it at http://localhost:6700/api for a local one.
  --force               Overwrite a summary or description that is already set.
                        Refused by default: a description edited in Spira is
                        newer than Linear's and putting the old one back is not
                        something a re-run should do silently.
  --dry-run             Accepted for symmetry; the dry run is already the default.
  --help                Print this and exit.

Reads SPIRA_API_TOKEN from the environment — the same PAT the MCP connector uses.

Examples:
  SPIRA_API_TOKEN=… pnpm backfill:project-descriptions            # report only
  SPIRA_API_TOKEN=… pnpm backfill:project-descriptions -- --commit`;

function parseArgs(argv: string[]): BackfillOptions {
  let file: string | undefined;
  let api = DEFAULT_API;
  let commit = false;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const flag = eq === -1 ? a : a.slice(0, eq);
    const inlineVal = eq === -1 ? undefined : a.slice(eq + 1);
    const nextVal = (): string => {
      const v = inlineVal ?? argv[(i += 1)];
      if (v === undefined) throw new UsageError(`${flag} needs a value.`);
      return v;
    };

    switch (flag) {
      case "--":
        break; // pnpm forwards the `--` separator literally
      case "--commit":
        commit = true;
        break;
      case "--dry-run":
        break; // already the default; accepted so the documented flag works
      case "--force":
        force = true;
        break;
      case "--api":
        api = nextVal();
        break;
      case "--help":
      case "-h":
        throw new UsageError("");
      default:
        if (flag.startsWith("-")) throw new UsageError(`Unknown argument: ${a}`);
        if (file !== undefined) throw new UsageError(`Two input files given: ${file} and ${a}`);
        file = a;
    }
  }

  const chosen = file ?? DEFAULT_FILE;
  if (!existsSync(chosen)) throw new UsageError(`No such file: ${chosen}`);

  return { file: chosen, api: api.replace(/\/+$/, ""), commit, force };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
const rule = (title: string): void => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);

async function main(): Promise<void> {
  let opts: BackfillOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      if (err.message) console.error(`Error: ${err.message}\n`);
      console.error(USAGE);
      process.exit(err.message ? 1 : 0);
    }
    throw err;
  }

  const token = process.env.SPIRA_API_TOKEN;
  if (!token) {
    throw new Error("SPIRA_API_TOKEN is not set — mint one in Settings and pass it in the environment.");
  }

  console.log(`Reading ${opts.file}`);
  console.log(`  target: ${opts.api}`);
  console.log(`  mode: ${opts.commit ? "COMMIT — projects will be written" : "dry run — nothing is written"}`);

  const record = readRecord(opts.file);

  const updates: { key: string; summary: string | null; description: string | null; note: string }[] = [];
  const skipped: string[] = [];

  for (const entry of record) {
    if (entry.spiraKey === null) {
      skipped.push(`${entry.name} — no Spira project imported from it${entry.trashed ? " (trashed in Linear)" : ""}`);
      continue;
    }

    let project: ProjectDto;
    try {
      project = await call<ProjectDto>(opts.api, token, `/projects/${entry.spiraKey}`);
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("→ 404")) {
        skipped.push(`${entry.spiraKey} — no such project in this workspace`);
        continue;
      }
      throw err;
    }

    const summary = entry.summary.trim();
    const description = stripLinearMarkup(entry.description).trim();
    if (summary === "" && description === "") {
      skipped.push(`${entry.spiraKey} — Linear has no text either, so there is nothing to copy`);
      continue;
    }
    if (summary.length > SUMMARY_MAX) {
      throw new Error(`${entry.spiraKey}: summary is ${summary.length} characters, over the ${SUMMARY_MAX} column.`);
    }

    const held = (project.summary ?? "") !== "" || (project.description ?? "") !== "";
    if (held && !opts.force) {
      skipped.push(`${entry.spiraKey} — already has text of its own; --force to replace it`);
      continue;
    }

    updates.push({
      key: entry.spiraKey,
      summary: summary === "" ? null : summary,
      description: description === "" ? null : description,
      note: `${project.name}: ${summary.length} char summary, ${description.length} char description${
        held ? " (replacing what is there)" : ""
      }`,
    });
  }

  rule(`Skipped (${skipped.length})`);
  for (const line of skipped) console.log(`   ${line}`);

  rule(`To write (${updates.length})`);
  for (const update of updates) console.log(`   ${update.key.padEnd(4)} ${update.note}`);

  if (updates.length === 0) {
    console.log(`\n   Nothing to do.`);
    return;
  }

  if (!opts.commit) {
    console.log(`\n   Dry run. Re-run with --commit to write it.`);
    return;
  }

  console.log(`\n   Writing…`);
  for (const update of updates) {
    await call(opts.api, token, `/projects/${update.key}`, {
      method: "PATCH",
      body: JSON.stringify({ summary: update.summary, description: update.description }),
    });
    console.log(`   ${update.key} written`);
  }
  console.log(`   Done. ${updates.length} projects filled.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
