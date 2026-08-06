/**
 * Importer for the Linear CSV export (COS-283).
 *
 *   pnpm import:linear -- <export.csv> [--commit] [--side-file <file.json>]
 *
 * **Nothing is written without `--commit`.** The default is the dry run, and
 * that is deliberate: the ticket asks for a report reviewed before any real
 * run, and a flag that has to be *remembered* to stay safe is not a safeguard.
 * `--dry-run` is accepted so the documented spelling works, but it only asks
 * for what already happens.
 *
 * The dry run and the real run compute the same plan through the same code —
 * see `src/migration/linear-plan.util.ts`. The only difference is whether the
 * plan reaches Prisma afterwards.
 *
 * NOTE: like `seed.ts`, this is a standalone tool rather than app code. It
 * imports the gitignored generated Prisma client by relative path and runs
 * outside Nest, so it reads the environment itself.
 *
 * See scripts/import-guide.md for the full guide.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// --- inline .env loader (mirrors seed.ts; dotenv is a devDependency of nothing) ---
function loadEnv(): void {
  const path = resolve(__dirname, "..", ".env");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

import { parse } from "csv-parse/sync";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

import { resolveColumns } from "@migration/linear-columns.util";
import { labelColourFor } from "@migration/linear-vocabulary";
import { errorsIn, planImport, warningsIn, writeOrder } from "@migration/linear-plan.util";

import type { ColumnResolution } from "@migration/linear-columns.util";
import type { ExistingWorkspace, ImportPlan, ImportReport } from "@migration/linear-plan.util";

/** Long enough for a few thousand rows; the whole import is one transaction. */
const TRANSACTION_TIMEOUT_MS = 300_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;
/** How many examples of a repeated problem are printed before "and N more". */
const SAMPLE = 10;

function makePrisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — put it in nest-api/.env or pass it in the environment.");
  }
  const parsed = new URL(process.env.DATABASE_URL);
  // Force IPv4: the mariadb driver resolves "localhost" to ::1, where MySQL isn't listening locally.
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
  const adapter = new PrismaMariaDb({
    host,
    port: parseInt(parsed.port || "3306", 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace("/", ""),
    connectionLimit: 10,
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------
class UsageError extends Error {}

interface ImportOptions {
  file: string;
  commit: boolean;
  sideFile: string | null;
}

const USAGE = `Usage: pnpm import:linear -- <export.csv> [--commit] [--side-file <file.json>]

  <export.csv>          The Linear CSV export (M1). Required.
  --commit              Actually write. Without it this is a dry run and the
                        database is not touched.
  --dry-run             Accepted for symmetry; the dry run is already the default.
  --side-file <file>    The optional M1 connector dump, carrying relations and
                        comments the CSV cannot. Skipped when absent.
  --help                Print this and exit.

Examples:
  pnpm import:linear -- linear-export.csv                    # report only
  pnpm import:linear -- linear-export.csv --commit           # write it
  pnpm import:linear -- linear-export.csv --side-file extra.json --commit`;

function parseArgs(argv: string[]): ImportOptions {
  let file: string | undefined;
  let commit = false;
  let sideFile: string | null = null;

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
      case "--side-file":
        sideFile = nextVal();
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

  if (file === undefined) throw new UsageError("No CSV file given.");
  if (!existsSync(file)) throw new UsageError(`No such file: ${file}`);
  if (sideFile !== null && !existsSync(sideFile)) throw new UsageError(`No such side-file: ${sideFile}`);

  return { file, commit, sideFile };
}

// --------------------------------------------------------------------------
// The side-file: relations and comments the CSV cannot carry
// --------------------------------------------------------------------------
interface SideFile {
  relations: { from: string; type: "blocks" | "related"; to: string }[];
  comments: { issue: string; body: string; author?: string; createdAt?: string; updatedAt?: string }[];
}

/**
 * Read defensively rather than trustingly: this file is assembled by hand from
 * the connector at cutover, so a typo in it is likelier than a bug here, and it
 * should say which entry it choked on rather than throwing a cast error.
 */
function readSideFile(path: string): { side: SideFile; problems: string[] } {
  const problems: string[] = [];
  const side: SideFile = { relations: [], comments: [] };

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    return { side, problems: ["the side-file is not a JSON object"] };
  }

  const raw = parsed as { relations?: unknown; comments?: unknown };

  if (Array.isArray(raw.relations)) {
    raw.relations.forEach((entry: unknown, position) => {
      const r = entry as { from?: unknown; type?: unknown; to?: unknown };
      if (typeof r.from !== "string" || typeof r.to !== "string") {
        problems.push(`relations[${position}] needs string "from" and "to"`);
        return;
      }
      if (r.type !== "blocks" && r.type !== "related") {
        problems.push(`relations[${position}] type must be "blocks" or "related", not ${JSON.stringify(r.type)}`);
        return;
      }
      side.relations.push({ from: r.from.toUpperCase(), type: r.type, to: r.to.toUpperCase() });
    });
  } else if (raw.relations !== undefined) {
    problems.push(`"relations" must be an array`);
  }

  if (Array.isArray(raw.comments)) {
    raw.comments.forEach((entry: unknown, position) => {
      const c = entry as Record<string, unknown>;
      if (typeof c.issue !== "string" || typeof c.body !== "string") {
        problems.push(`comments[${position}] needs string "issue" and "body"`);
        return;
      }
      side.comments.push({
        issue: c.issue.toUpperCase(),
        body: c.body,
        author: typeof c.author === "string" ? c.author : undefined,
        createdAt: typeof c.createdAt === "string" ? c.createdAt : undefined,
        updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : undefined,
      });
    });
  } else if (raw.comments !== undefined) {
    problems.push(`"comments" must be an array`);
  }

  return { side, problems };
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------
const rule = (title: string): void => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);

function listSome<T>(entries: T[], render: (entry: T) => string): void {
  for (const entry of entries.slice(0, SAMPLE)) {
    console.log(`   ${render(entry)}`);
  }
  if (entries.length > SAMPLE) {
    console.log(`   … and ${entries.length - SAMPLE} more`);
  }
}

function printColumns(columns: ColumnResolution, header: string[]): void {
  rule("Columns");
  const used = Object.keys(columns.index).sort().join(", ");
  console.log(`   read (${Object.keys(columns.index).length}): ${used}`);
  if (columns.ignored.length > 0) {
    console.log(`   ignored (${columns.ignored.length}): ${columns.ignored.join(", ")}`);
  }
  if (columns.unrecognised.length > 0) {
    console.log(`   UNRECOGNISED (${columns.unrecognised.length}): ${columns.unrecognised.join(", ")}`);
    console.log(`     ↳ not an error — but if any of these matter, teach linear-columns.util.ts about them`);
  }
  for (const clash of columns.duplicated) {
    console.log(`   two columns claim "${clash.field}": ${clash.headers.join(", ")} — the first is used`);
  }
  if (columns.missingRequired.length > 0) {
    console.log(`   MISSING, and required: ${columns.missingRequired.join(", ")}`);
    console.log(`   the header actually read: ${header.join(" | ")}`);
  }
}

function printReport(report: ImportReport): void {
  rule("Issues per project");
  for (const project of report.byProject) {
    console.log(
      `   ${project.key.padEnd(4)} ${String(project.count).padStart(4)}  ${project.first} … ${project.last}` +
        `   ${project.names.join(" / ")}`,
    );
  }
  console.log(`   ${"".padEnd(4)} ${String(report.rowsPlanned).padStart(4)}  total, from ${report.rowsRead} rows read`);

  rule("States");
  for (const state of report.byState) {
    console.log(`   ${state.state.padEnd(12)} ${String(state.count).padStart(4)}`);
  }

  rule(`Labels (${report.labels.length})`);
  listSome(report.labels, (label) => `${String(label.count).padStart(4)}  ${label.name}`);

  rule("Epics");
  console.log(`   ${report.epics} epics, ${report.epicChildren} issues inside one`);

  const errors = errorsIn(report);
  const warnings = warningsIn(report);

  if (warnings.length > 0) {
    rule(`Warnings (${warnings.length}) — imported anyway`);
    for (const warning of warnings) {
      console.log(`   • ${warning}`);
    }
    if (report.flattened.length > 0) {
      console.log(`\n   every flattened issue:`);
      listSome(report.flattened, (f) => `${f.id}: parent ${f.from} → epic ${f.to} (was ${f.depth} levels deep)`);
    }
    if (report.crossProjectEpics.length > 0) {
      console.log(`\n   epics reaching across projects:`);
      listSome(report.crossProjectEpics, (c) => `${c.id} (${c.project}) → ${c.epic} (${c.epicProject})`);
    }
    if (report.unreadableDates.length > 0) {
      console.log(`\n   unreadable dates:`);
      listSome(report.unreadableDates, (d) => `line ${d.line}, ${d.field} = ${JSON.stringify(d.value)}`);
    }
  }

  if (errors.length > 0) {
    rule(`Errors (${errors.length}) — these stop the import`);
    for (const error of errors) {
      console.log(`   ✗ ${error}`);
    }
    if (report.malformed.length > 0) {
      console.log(`\n   malformed rows:`);
      listSome(report.malformed, (m) => `line ${m.line}${m.id ? ` (${m.id})` : ""}: ${m.reasons.join("; ")}`);
    }
    if (report.danglingParents.length > 0) {
      console.log(`\n   parents not in the export:`);
      listSome(report.danglingParents, (d) => `${d.id} → ${d.parent}`);
    }
  }
}

// --------------------------------------------------------------------------
// Writing
// --------------------------------------------------------------------------
async function readExisting(prisma: PrismaClient): Promise<ExistingWorkspace> {
  const [issues, projects] = await Promise.all([
    prisma.issue.findMany({ select: { identifier: true, legacyIdentifier: true } }),
    prisma.project.findMany({ select: { key: true, issueCounter: true } }),
  ]);

  return {
    identifiers: new Set(issues.map((issue) => issue.identifier)),
    legacyIdentifiers: new Set(
      issues.map((issue) => issue.legacyIdentifier).filter((value): value is string => value !== null),
    ),
    counters: new Map(projects.map((project) => [project.key, project.issueCounter])),
  };
}

async function write(prisma: PrismaClient, plan: ImportPlan, side: SideFile | null): Promise<void> {
  const states = await prisma.workflowState.findMany({ select: { id: true, name: true } });
  const stateIds = new Map(states.map((state) => [state.name, state.id]));

  const missingStates = [...new Set(plan.issues.map((issue) => issue.state))].filter((name) => !stateIds.has(name));
  if (missingStates.length > 0) {
    throw new Error(
      `The workspace has no state named ${missingStates.join(", ")}. Run \`pnpm seed\` first — ` +
        `the importer maps onto the seeded six, it does not create them.`,
    );
  }

  await prisma.$transaction(
    async (tx) => {
      // --- projects: matched on key, never overwritten ---------------------
      // An existing project's name, icon and colour are the workspace's own and
      // outrank the export's. Only a key with nothing behind it is created.
      const projectIds = new Map<string, string>();
      const lastPosition = await tx.project.aggregate({ _max: { position: true } });
      let position = (lastPosition._max.position ?? -1) + 1;
      const backlogId = stateIds.get("Backlog") as string;

      for (const project of plan.report.byProject) {
        const existing = await tx.project.findUnique({ where: { key: project.key }, select: { id: true } });
        if (existing) {
          projectIds.set(project.key, existing.id);
          continue;
        }
        const created = await tx.project.create({
          data: {
            id: randomUUID(),
            key: project.key,
            name: project.name.slice(0, 120),
            statusId: backlogId,
            position: position++,
          },
          select: { id: true },
        });
        projectIds.set(project.key, created.id);
      }

      // --- labels: created on the fly, preserving names --------------------
      const labelIds = new Map<string, string>();
      for (const label of plan.report.labels) {
        const row = await tx.label.upsert({
          where: { name: label.name },
          update: {},
          create: { id: randomUUID(), name: label.name, color: labelColourFor(label.name) },
          select: { id: true },
        });
        labelIds.set(label.name, row.id);
      }

      // --- issues ----------------------------------------------------------
      const issueIds = new Map<string, string>();
      for (const issue of plan.issues) {
        issueIds.set(issue.legacyIdentifier, randomUUID());
      }

      // Epics first — see `writeOrder`. Writing `epicId` in a second pass
      // instead would restamp every child's `updatedAt`, which is `@updatedAt`.
      await tx.issue.createMany({
        data: writeOrder(plan.issues).map((issue) => ({
          id: issueIds.get(issue.legacyIdentifier) as string,
          projectId: projectIds.get(issue.projectKey) as string,
          number: issue.number,
          identifier: issue.identifier,
          legacyIdentifier: issue.legacyIdentifier,
          title: issue.title.slice(0, 255),
          description: issue.description,
          stateId: stateIds.get(issue.state) as string,
          priority: issue.priority,
          isEpic: issue.isEpic,
          epicId: issue.epicOf === null ? null : (issueIds.get(issue.epicOf) ?? null),
          sortOrder: issue.sortOrder,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          completedAt: issue.completedAt,
          canceledAt: issue.canceledAt,
          archivedAt: issue.archivedAt,
        })),
      });

      const pairs = plan.issues.flatMap((issue) =>
        issue.labels.map((label) => ({
          issueId: issueIds.get(issue.legacyIdentifier) as string,
          labelId: labelIds.get(label) as string,
        })),
      );
      await tx.issueLabel.createMany({ data: pairs, skipDuplicates: true });

      // --- counters --------------------------------------------------------
      // Never lowered: `Math.max` guards the case of importing into a project
      // that already handed out a higher number than anything in this export.
      for (const project of plan.report.byProject) {
        const highest = plan.issues
          .filter((issue) => issue.projectKey === project.key)
          .reduce((max, issue) => Math.max(max, issue.number), 0);
        const current = await tx.project.findUnique({ where: { key: project.key }, select: { issueCounter: true } });
        await tx.project.update({
          where: { key: project.key },
          data: { issueCounter: Math.max(current?.issueCounter ?? 0, highest) },
        });
      }

      // --- the side-file, if one was taken ---------------------------------
      if (side) {
        const relations = side.relations
          .map((relation) => {
            let fromIssueId = issueIds.get(relation.from);
            let toIssueId = issueIds.get(relation.to);
            if (!fromIssueId || !toIssueId || fromIssueId === toIssueId) return null;
            // `related` is symmetric — normalised on the lower id, as the API does.
            if (relation.type === "related" && fromIssueId > toIssueId) {
              [fromIssueId, toIssueId] = [toIssueId, fromIssueId];
            }
            return { id: randomUUID(), fromIssueId, toIssueId, type: relation.type };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        await tx.issueRelation.createMany({ data: relations, skipDuplicates: true });

        const comments = side.comments
          .map((comment) => {
            const issueId = issueIds.get(comment.issue);
            if (!issueId) return null;
            // `Comment.createdAt` and `updatedAt` are both non-nullable, so an
            // unreadable one has to become *something*. Every branch is guarded
            // rather than only the first: an `Invalid Date` reaching Prisma is
            // a thrown transaction at the end of a long import.
            const usable = (value: string | undefined, fallback: Date): Date => {
              if (value === undefined) return fallback;
              const parsed = new Date(value);
              return Number.isNaN(parsed.getTime()) ? fallback : parsed;
            };
            const createdAt = usable(comment.createdAt, new Date());
            return {
              id: randomUUID(),
              issueId,
              parentId: null,
              body: comment.body,
              authorName: (comment.author ?? "cosmokaat").slice(0, 80),
              createdAt,
              updatedAt: usable(comment.updatedAt, createdAt),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        await tx.comment.createMany({ data: comments, skipDuplicates: true });

        console.log(`\n   side-file: ${relations.length} relations, ${comments.length} comments`);
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
  );
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main(): Promise<void> {
  let opts: ImportOptions;
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

  console.log(`Reading ${opts.file}`);
  console.log(`  mode: ${opts.commit ? "COMMIT — the database will be written" : "dry run — nothing is written"}`);

  // `relax_column_count` so a row with a stray extra comma is reported by the
  // plan as a malformed *issue* rather than killing the parse of the whole
  // file; `bom` because a CSV downloaded on Windows carries one and it would
  // otherwise become part of the first column's name.
  const rows: string[][] = parse(readFileSync(opts.file), {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
    trim: false,
  });

  if (rows.length === 0) {
    throw new Error("The file has no rows at all.");
  }

  const [header, ...body] = rows;
  const columns = resolveColumns(header);
  printColumns(columns, header);

  if (columns.missingRequired.length > 0) {
    console.error(`\nRefusing to go on: the export is missing ${columns.missingRequired.join(", ")}.`);
    process.exit(1);
  }

  let side: SideFile | null = null;
  if (opts.sideFile) {
    const read = readSideFile(opts.sideFile);
    rule("Side-file");
    console.log(`   ${read.side.relations.length} relations, ${read.side.comments.length} comments`);
    if (read.problems.length > 0) {
      console.log(`   skipped ${read.problems.length} unusable entries:`);
      listSome(read.problems, (problem) => problem);
    }
    side = read.side;
  }

  const prisma = makePrisma();
  try {
    const existing = await readExisting(prisma);
    const plan = planImport(body, columns.index, existing);

    printReport(plan.report);

    const errors = errorsIn(plan.report);
    rule("Verdict");

    if (errors.length > 0) {
      console.log(`   NOT CLEAN — ${errors.length} problems above. Nothing was written.`);
      process.exit(1);
    }

    console.log(`   clean: ${plan.issues.length} issues ready across ${plan.report.byProject.length} projects`);

    if (!opts.commit) {
      console.log(`\n   Dry run. Re-run with --commit to write it.`);
      return;
    }

    console.log(`\n   Writing…`);
    await write(prisma, plan, side);
    console.log(`   Done. ${plan.issues.length} issues imported.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
