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
import { errorsIn, planImport, warningsIn } from "@migration/linear-plan.util";
import { withoutOrphans } from "@migration/linear-orphans.util";
import { readSideFile } from "@migration/linear-side-file.util";
import { readExisting, writeImport } from "@migration/linear-write.util";

import type { ColumnResolution } from "@migration/linear-columns.util";
import type { ImportReport } from "@migration/linear-plan.util";
import type { SideFile } from "@migration/linear-side-file.util";

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
  allowContinuedNumbering: boolean;
  skipOrphans: boolean;
  username: string | null;
}

const USAGE = `Usage: pnpm import:linear -- <export.csv> [--commit] [--side-file <file.json>]

  <export.csv>          The Linear CSV export (M1). Required.
  --commit              Actually write. Without it this is a dry run and the
                        database is not touched.
  --username <name>     The account to import into. Required once the database
                        holds more than one, because "the workspace" is no longer
                        a single thing — importing into the wrong one is not
                        something the report would catch.
  --dry-run             Accepted for symmetry; the dry run is already the default.
  --side-file <file>    The optional M1 connector dump, carrying relations and
                        comments the CSV cannot. Skipped when absent.
  --allow-continued-numbering
                        Write even though some project already holds issues, so
                        its import starts at KEY-N+1 instead of KEY-1. Refused by
                        default: at cutover this almost always means the demo data
                        from 'pnpm seed' is still there, and the numbering it
                        causes cannot be undone afterwards.
  --skip-orphans        Leave out rows with an empty Project cell instead of
                        failing on them. Linear's own onboarding tickets have no
                        project, and one of them is otherwise enough to stop a
                        whole workspace's import. Every skipped row is listed.
  --help                Print this and exit.

Examples:
  pnpm import:linear -- linear-export.csv                    # report only
  pnpm import:linear -- linear-export.csv --commit           # write it
  pnpm import:linear -- linear-export.csv --side-file extra.json --commit`;

function parseArgs(argv: string[]): ImportOptions {
  let file: string | undefined;
  let commit = false;
  let sideFile: string | null = null;
  let allowContinuedNumbering = false;
  let skipOrphans = false;
  let username: string | null = null;

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
      case "--allow-continued-numbering":
        allowContinuedNumbering = true;
        break;
      case "--skip-orphans":
        skipOrphans = true;
        break;
      case "--username":
        username = nextVal();
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

  return { file, commit, sideFile, allowContinuedNumbering, skipOrphans, username };
}

/**
 * Which account this import belongs to. Guessing is only safe when there is
 * nothing to guess between: with two accounts in the database, importing five
 * hundred issues into the wrong workspace is silent, and undoing it means
 * deleting them all again.
 */
async function resolveOwnerId(prisma: PrismaClient, username: string | null): Promise<string> {
  if (username !== null) {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new Error(`No account named "${username}". Create it with \`pnpm seed -- --username ${username}\`.`);
    return user.id;
  }

  const users = await prisma.user.findMany({ select: { id: true, username: true }, orderBy: { createdAt: "asc" } });
  if (users.length === 0) {
    throw new Error("No account exists. Run `pnpm seed` first — the importer maps onto a workspace, it does not create one.");
  }
  if (users.length > 1) {
    throw new Error(
      `This database holds ${users.length} accounts (${users.map((u) => u.username).join(", ")}). ` +
        `Say which one to import into with --username <name>.`,
    );
  }
  return users[0].id;
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

  // Dropped here rather than inside the planner so that nothing about how a row becomes an issue
  // changes: these rows simply never reach it, and the planner's own definition of malformed —
  // which still catches an empty project cell — is untouched.
  const planned = opts.skipOrphans ? withoutOrphans(body, columns.index) : { rows: body, orphans: [] };
  if (opts.skipOrphans) {
    rule(`Orphans skipped (${planned.orphans.length})`);
    if (planned.orphans.length === 0) {
      console.log(`   none — every row names a project, so --skip-orphans changed nothing`);
    } else {
      listSome(planned.orphans, (orphan) => `line ${orphan.line}: ${orphan.id || "(no ID)"} ${orphan.title}`);
      console.log(`   ↳ these will not exist in Spira at all. Read the list before committing.`);
    }
  }

  let side: SideFile | null = null;
  if (opts.sideFile) {
    const read = readSideFile(readFileSync(opts.sideFile, "utf8"));
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
    const ownerId = await resolveOwnerId(prisma, opts.username);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { username: true } });
    rule("Target");
    console.log(`   importing into the workspace of ${owner.username}`);

    const existing = await readExisting(prisma, ownerId);
    const plan = planImport(planned.rows, columns.index, existing);

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

    // M3's rule is "renumbered from 1 under the project key", and this is the one way to lose it
    // silently. The importer requires `pnpm seed` to have run, and the seeder writes demo issues plus
    // a non-zero issueCounter — so on a freshly provisioned box every project reports continued
    // numbering, and a --commit run would permanently start the real import at KEY-N+1. It was only a
    // warning in a long report, which is not where an irreversible decision belongs.
    if (plan.report.continuedNumbering.length > 0 && !opts.allowContinuedNumbering) {
      console.error(`\n   REFUSING TO WRITE — ${plan.report.continuedNumbering.length} project(s) already hold issues:`);
      for (const project of plan.report.continuedNumbering) {
        console.error(`     ${project.key} would start at ${project.key}-${project.from + 1}, not ${project.key}-1`);
      }
      console.error(`\n   This is almost certainly the demo data from \`pnpm seed\`. Clear it and re-run,`);
      console.error(`   or pass --allow-continued-numbering if the existing issues are meant to stay.`);
      console.error(`   Renumbering cannot be redone once the import is written.`);
      process.exit(1);
    }

    console.log(`\n   Writing…`);
    const written = await writeImport(prisma, ownerId, plan, side);
    if (side) {
      console.log(`   side-file: ${written.relations} relations, ${written.comments} comments`);
    }
    console.log(`   Done. ${written.issues} issues imported.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
