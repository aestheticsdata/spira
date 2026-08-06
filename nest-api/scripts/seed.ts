/**
 * Seeder for the single Spira account and the demo workspace shown in the
 * design handoff: six workflow states, six labels, nine projects and their
 * issues, epics and relations.
 *
 *   pnpm seed -- [--username <name>] [--password <secret>] [--wipe]
 *
 * Idempotent. Every row is upserted on its natural key — state name, label
 * name, project key, issue identifier — so re-running tops the workspace back
 * up instead of duplicating it. `--wipe` clears the content first but never the
 * account, so a rebuild does not invalidate the password of the last run.
 *
 * NOTE: this is a standalone tool, not app code — it imports the gitignored
 * generated Prisma client by relative path (no path alias exists for it), and
 * it runs outside Nest, so it reads the environment itself.
 *
 * See scripts/seeding-guide.md for the full guide.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomInt, randomUUID } from "node:crypto";

// --- inline .env loader (dotenv is not installed; Node 18 has no --env-file) ---
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

import { hash } from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

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
// Constants
// --------------------------------------------------------------------------
const DEFAULT_USERNAME = "cosmokaat";
const BCRYPT_ROUNDS = 12;
/** Mirrors PASSWORD_MIN_LENGTH in src/config/field-limits.ts. */
const MIN_PASSWORD_LENGTH = 6;
const GENERATED_PASSWORD_LENGTH = 20;
/** No 0/O/1/l/I: a generated password gets read off a terminal and retyped. */
const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_=+@#%*";

/** Every demo issue is dated in July 2026, matching the design file's date column. */
const CREATED_YEAR = 2026;
const CREATED_MONTH = 6;
/** Manual ordering leaves room between neighbours so a drag can land in between. */
const SORT_ORDER_STEP = 1024;

type StateKey = "backlog" | "todo" | "prog" | "review" | "done" | "canceled";
type LabelKey = "feature" | "imp" | "bug" | "demock" | "dash" | "ds";

// Done and Canceled reuse the palette's --ok / --danger semantic tokens rather
// than a neutral grey: the owner wants Done recognisably green, and a shared
// grey made it and Canceled read as the same colour at a glance.
const STATES: { key: StateKey; name: string; type: string; color: string }[] = [
  { key: "backlog", name: "Backlog", type: "backlog", color: "#a6a8ae" },
  { key: "todo", name: "Todo", type: "unstarted", color: "#a6a8ae" },
  { key: "prog", name: "In Progress", type: "started", color: "#c9a05a" },
  { key: "review", name: "In Review", type: "started", color: "#a99fc0" },
  { key: "done", name: "Done", type: "completed", color: "#8fae97" },
  { key: "canceled", name: "Canceled", type: "canceled", color: "#c48a83" },
];

const LABELS: { key: LabelKey; name: string; color: string }[] = [
  { key: "feature", name: "Feature", color: "#9db1c4" },
  { key: "imp", name: "Improvement", color: "#9db1c4" },
  { key: "bug", name: "Bug", color: "#c48a83" },
  { key: "demock", name: "de-mock", color: "#c9a05a" },
  { key: "dash", name: "Dashboard", color: "#8fae97" },
  { key: "ds", name: "design system", color: "#a99fc0" },
];

interface ProjectSeed {
  key: string;
  name: string;
  /** Material Symbols Rounded ligature. */
  icon: string;
  color: string;
  summary: string;
  /** Absent from the design file — a plausible value for the project's own status row. */
  status: StateKey;
  priority: number;
}

/**
 * Markdown rendered on each project's overview page, transcribed from the `OV`
 * object in the design file (`design_handoff_spira/spira-v3-neutral.html`).
 * The design's block types map to markdown: `h` -> `##`, `p`/`p2` -> a
 * paragraph, `code` -> a fenced block.
 */
const PROJECT_DESCRIPTIONS: Record<string, string> = {
  SPI: [
    "## Goal",
    "",
    "Replace Linear with a self-hosted, single-user ticketing app. The paid plan carries a lot that goes",
    "unused, and the workspace-level prefix means all six projects share one COS- counter — COS-177 is a PFA",
    "ticket and COS-201 is a 3D engine ticket, with nothing in the identifier saying so.",
    "",
    "## Two hard requirements",
    "",
    "Per-project prefixes. New issues get PFA-1, 3DE-1, SPI-1 — first three letters of the project, editable",
    "and unique.",
    "",
    "Legacy references keep resolving. Hundreds of COS-xxx identifiers live in commit messages, code comments",
    "and PR descriptions. On import every issue is renumbered under its project key and its original",
    "identifier is kept in legacyIdentifier: both indexed, both searchable, the row renders PFA-12 with a",
    "subdued COS-177 beside it.",
    "",
    "## Architecture",
    "",
    "A Next front and a Nest API on ks-b behind nginx. Reads go through the API from Server Components;",
    "every write goes through the same REST surface, because the MCP connector needs a callable HTTP surface",
    "and one write path beats two implementations of the same rules.",
    "",
    "```",
    "Prisma 7 · MySQL · Redis · Tailwind v4 · shadcn/ui · nuqs · zod v4 · TanStack Query · Biome",
    "```",
    "",
    "## Model",
    "",
    "Epics are ordinary issues flagged isEpic, so they get their own identifier, description and status.",
    "Other issues point at one via epicId. An epic cannot sit inside an epic — the hierarchy is exactly one",
    "level. Blocking is stored once as A blocks B; blocked by is the same row read backwards, so the two",
    "views cannot disagree.",
    "",
    "## Not in v1",
    "",
    "Board layout, drag & drop, comments, activity history, command palette, keyboard shortcuts, milestones,",
    "cycles, initiatives, attachments, assignees, estimates, multi-user.",
  ].join("\n"),
  PFA: [
    "## Goal",
    "",
    "Personal finance app: expenses, exceptional entries, statistics and a dashboard, with a hand-rolled",
    "dataviz layer. Front in Next, back in nest-api, multilingual FR/EN through the @text module.",
  ].join("\n"),
  "3DE": [
    "## Goal",
    "",
    "A software renderer and its console: scanline rasteriser, depth buffer, procedural materials, and a",
    "debug panel that reports staged timings, draw calls and fill rate. The de-mock epic replaces every fake",
    "readout with a real one.",
  ].join("\n"),
  IKN: [
    "## Goal",
    "",
    "Self-hosted monitoring for the apps on ks-b: ECS logs, Prometheus metrics, grouped errors and alerts,",
    "with no lock-in.",
  ].join("\n"),
  ZEU: [
    "## Goal",
    "",
    "Fleet control plane for the apps on ks-b: port registry, status, start/stop, port reassignment.",
  ].join("\n"),
  EXA: [
    "## Goal",
    "",
    "Extract PFA's generic UI building blocks (dataviz, month-picker) into app-agnostic modules, reusable",
    "through a shadcn-style registry — copy-and-own, not a package.",
  ].join("\n"),
  CHT: [
    "## Goal",
    "",
    "Hand-built React chat UI on top of the existing skeleton and @services layer.",
  ].join("\n"),
  WEA: [
    "## Goal",
    "",
    "Daily sky log — declare the weather over your city, compare it to the forecast, and see everyone ranked",
    "by participation.",
  ].join("\n"),
  BMK: [
    "## Goal",
    "",
    "A place for bookmarks that is not a browser profile.",
  ].join("\n"),
};

const PROJECTS: ProjectSeed[] = [
  {
    key: "SPI",
    name: "Spira",
    icon: "graph_3",
    color: "#3ecf8e",
    summary: "Self-hosted single-user ticketing app replacing Linear",
    status: "prog",
    priority: 1,
  },
  {
    key: "PFA",
    name: "PFA",
    icon: "euro",
    color: "#2bb0c4",
    summary: "Personal finance app — front, nest-api, dataviz",
    status: "prog",
    priority: 2,
  },
  {
    key: "3DE",
    name: "3D engine",
    icon: "deployed_code",
    color: "#f13ec9",
    summary: "Software renderer and console for polyhedra",
    status: "prog",
    priority: 3,
  },
  {
    key: "IKN",
    name: "Iknos",
    icon: "monitor_heart",
    color: "#c98a2b",
    summary: "Self-hosted monitoring for the apps on ks-b",
    status: "backlog",
    priority: 3,
  },
  {
    key: "ZEU",
    name: "Zeus",
    icon: "bolt",
    color: "#f5a623",
    summary: "Fleet control plane: ports, status, start/stop",
    status: "backlog",
    priority: 3,
  },
  {
    key: "EXA",
    name: "Exalus",
    icon: "widgets",
    color: "#1a8cff",
    summary: "PFA's UI blocks as a copy-and-own registry",
    status: "backlog",
    priority: 4,
  },
  {
    key: "CHT",
    name: "1991chat",
    icon: "forum",
    color: "#e8eaed",
    summary: "Hand-built React chat front-end",
    status: "prog",
    priority: 4,
  },
  {
    key: "WEA",
    name: "Worldweathr",
    icon: "partly_cloudy_day",
    color: "#38bdf8",
    summary: "Daily sky log, forecast agreement, leaderboard",
    status: "prog",
    priority: 3,
  },
  {
    key: "BMK",
    name: "BKMK",
    icon: "bookmark",
    color: "#f0836f",
    summary: "Bookmark keeper",
    status: "backlog",
    priority: 4,
  },
];

/**
 * One demo issue, transcribed from the design file's ISSUES rows:
 * [identifier, legacyIdentifier, title, state, priority, labels, day of July 2026, epic, isEpic].
 * The project key and the issue number are read back off the identifier.
 */
type IssueRow = [string, string | null, string, StateKey, number, LabelKey[], number, string | null, boolean?];

const ISSUES: IssueRow[] = [
  ["SPI-1", "COS-251", "Spira — self-hosted Linear replacement", "backlog", 2, [], 28, null, true],
  ["SPI-2", "COS-252", "M1 — Full CSV export of the Linear workspace", "prog", 2, [], 28, "SPI-1"],
  ["SPI-3", "COS-253", "F1 — Repo scaffold: Next 16, TypeScript, Biome, Tailwind v4, shadcn", "done", 2, [], 28, "SPI-1"],
  ["SPI-4", "COS-254", "F2 — Prisma schema and first migration", "todo", 2, [], 28, "SPI-1"],
  ["SPI-5", "COS-255", "F3 — Dev environment: MySQL, Redis, env config and seed", "todo", 2, [], 28, "SPI-1"],
  ["SPI-6", "COS-256", "A1 — Session layer: Redis store and httpOnly cookie", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-7", "COS-257", "A2 — CSRF token: mint, rotate and validate", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-8", "COS-258", "A3 — Login, logout and route protection", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-9", "COS-259", "A4 — Login rate limiting and password change", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-10", "COS-260", "P1 — Route handler conventions: validation, error shape, auth wrapper", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-11", "COS-261", "P2 — Projects API", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-12", "COS-262", "P3 — Issues API and identifier allocation", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-13", "COS-263", "P4 — Labels API and issue-label assignment", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-14", "COS-264", "P5 — Epic assignment and relations API", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-15", "COS-265", "P6 — Saved views API", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-16", "COS-266", "U1 — App shell: sidebar, header and navigation", "done", 2, [], 28, "SPI-1"],
  ["SPI-17", "COS-267", "U2 — Design tokens and dark theme", "done", 2, ["ds"], 28, "SPI-1"],
  ["SPI-18", "COS-268", "R1 — Projects list page", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-19", "COS-269", "R2 — Project create/edit form and the key rules", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-20", "COS-270", "R3 — Project overview page", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-21", "COS-271", "I1 — Markdown editor with live preview", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-22", "COS-272", "I2 — Markdown renderer and ticket reference chips", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-23", "COS-273", "I3 — Issue list layout grouped by status", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-24", "COS-284", "M3 — Renumbering, legacy identifiers and redirects", "backlog", 2, [], 28, "SPI-1"],
  ["SPI-25", "COS-274", "I4 — Display properties and ordering", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-26", "COS-275", "I5 — Issue detail page and properties panel", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-27", "COS-276", "I6 — Issue creation", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-28", "COS-277", "V1 — Filter bar with URL state", "backlog", 2, ["feature"], 28, "SPI-1"],
  ["SPI-29", "COS-278", "V2 — Saved views", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-30", "COS-279", "E1 — Epics: contained issues and progress", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-31", "COS-280", "E2 — Relations UI: blocks and blocked by", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-32", "COS-281", "S1 — Search across identifiers and text", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-33", "COS-282", "U3 — Settings: labels and account", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-34", "COS-283", "M2 — CSV importer: parsing and mapping", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-35", "COS-285", "C1 — API tokens", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-36", "COS-286", "C2 — MCP server for Spira", "backlog", 3, ["feature"], 28, "SPI-1"],
  ["SPI-37", "COS-287", "D1 — Provision ks-b: MySQL, Redis, nginx, systemd", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-38", "COS-288", "D2 — Deploy pipeline and backups", "backlog", 3, [], 28, "SPI-1"],
  ["SPI-39", "COS-289", "M4 — Cutover", "backlog", 3, [], 28, "SPI-1"],

  ["PFA-3", "COS-29", "Passer le front à TypeScript 7", "todo", 4, ["imp"], 9, null],
  ["PFA-41", "COS-177", "Uniformiser les schémas de formulaire « saisie de montant »", "backlog", 4, ["imp"], 26, null],
  ["PFA-36", "COS-165", "Découper StatsService en services par consommateur (refacto pur)", "backlog", 3, ["imp"], 22, null],
  ["PFA-31", "COS-153", "Indexer les tables financières sur (userID, date)", "backlog", 3, ["imp"], 21, null],
  ["PFA-24", "COS-133", "Dashboard : curseur par défaut sur « Mois en cours » désactivé", "backlog", 3, ["dash", "imp"], 18, null],
  ["PFA-12", "COS-79", "Corriger les warnings Biome noNonNullAssertion du front", "backlog", 3, ["imp"], 14, null],
  ["PFA-8", "COS-53", "Refacto archi : Server Components (fetch initial serveur + îlots client)", "backlog", 3, ["imp"], 10, null],
  ["PFA-4", "COS-31", "Ajouter des tests unitaires (back nest-api)", "backlog", 3, ["imp"], 9, null],
  ["PFA-2", "COS-28", "Passer le back (nest-api) à TypeScript 7", "backlog", 3, ["imp"], 9, null],
  ["PFA-47", "COS-185", "Dépenses : animer les chiffres des widgets et la barre de répartition", "done", 3, ["dash", "imp"], 27, null],
  ["PFA-45", "COS-183", "Stats : tracer les sparklines KPI en une fois", "done", 3, ["imp"], 27, null],
  ["PFA-44", "COS-182", "Stats jour de la semaine : échelle robuste + mobile", "done", 3, ["imp"], 27, null],
  ["PFA-35", "COS-163", "Mobile : sous-menu Langue hors écran → bloc compte en bas du drawer", "done", 3, ["bug", "imp"], 22, null],
  ["PFA-33", "COS-161", "Navbar : flouter la page quand un overlay s'ouvre + animer le calendrier", "done", 3, ["ds", "imp"], 22, null],

  ["3DE-2", "COS-201", "Polyhedra from The Symmetries of Things", "prog", 2, [], 27, null, true],
  ["3DE-15", "COS-235", "de-mock — the engine behind the console", "backlog", 2, ["demock"], 28, null, true],
  ["3DE-16", "COS-236", "E2 — Projection: orthographic, FOV and clip planes", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-17", "COS-237", "E1a — Camera rig: absolute orientation, view presets and readouts", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-18", "COS-238", "E1b — Pointer orbit, wheel zoom, pinch and double-tap", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-19", "COS-239", "E6 — Renderer instrumentation: staged timings, draw calls, fill rate", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-20", "COS-240", "E4a — Materials: material model, base colour and mesh scale", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-21", "COS-241", "E3a — Face normals and the directional key light", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-22", "COS-242", "E3b — Software scanline rasteriser with a depth buffer", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-23", "COS-243", "E3c — GOURAUD, DEPTH, NORMALS and POINTS modes", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-24", "COS-244", "E3d — Dithering and edge antialiasing", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-25", "COS-245", "E4b — Procedural textures, spherical UVs and tiling", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-26", "COS-246", "E5a — Ground under the camera: shared projector, grid and world units", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-27", "COS-247", "E5b — Ground shadow, distance fog and the layer-pass count", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-28", "COS-248", "E7 — Scene model: real objects, per-object visibility and selection", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-29", "COS-249", "E8 — Session actions and keyboard", "backlog", 3, ["demock"], 28, "3DE-15"],
  ["3DE-30", "COS-250", "E9b — Resize, DPR and the pixel budget", "backlog", 3, ["demock"], 28, "3DE-15"],

  ["IKN-1", "COS-190", "Epic: Iknos — self-hosted monitoring for ks-b", "backlog", 2, [], 24, null, true],
  ["IKN-2", "COS-191", "ECS log ingestion and retention windows", "backlog", 3, ["feature"], 24, "IKN-1"],
  ["IKN-3", "COS-192", "Prometheus scrape config per app", "backlog", 3, ["feature"], 24, "IKN-1"],
  ["IKN-4", "COS-193", "Grouped errors: fingerprint and first/last seen", "backlog", 3, ["feature"], 24, "IKN-1"],

  ["ZEU-1", "COS-120", "Port registry: one source of truth for ks-b", "backlog", 2, ["feature"], 16, null],
  ["ZEU-2", "COS-121", "Start / stop / restart an app from the control plane", "backlog", 3, ["feature"], 16, null],
  ["ZEU-3", "COS-122", "Port reassignment with nginx reload", "backlog", 3, ["feature"], 16, null],

  ["EXA-1", "COS-231", "Registry scaffold: cssVars, css and copy-and-own components", "backlog", 3, ["feature"], 28, null],

  ["CHT-1", "COS-100", "Message list virtualisation on the existing skeleton", "done", 3, ["feature"], 12, null],
  ["CHT-2", "COS-101", "Composer: drafts, paste and shortcuts", "backlog", 3, ["feature"], 12, null],
  ["CHT-3", "COS-102", "@services layer: transport-agnostic client", "backlog", 2, ["feature"], 12, null],

  ["WEA-55", "COS-88", "Community visibility opt-out (visibleInCommunity toggle)", "todo", 3, ["feature"], 20, null],
  ["WEA-40", "COS-70", "Forecast observation refresh cron", "done", 2, [], 15, null],
  ["WEA-41", "COS-71", "WeatherIcon React port", "done", 3, ["ds"], 15, null],

  ["BMK-1", "COS-300", "Import browser bookmarks and dedupe", "backlog", 4, [], 29, null],
];

/** The design file's two written-out bodies, as the markdown their blocks stand for. */
const DESCRIPTIONS: Record<string, string> = {
  "SPI-24": [
    "## What this ticket does",
    "",
    "Every imported issue is renumbered under its project key. The original Linear identifier is kept in " +
      "legacyIdentifier — indexed, searchable, and rendered beside the live one everywhere a row appears.",
    "",
    "## Rules",
    "",
    "- Numbering restarts at 1 per project, ordered by Linear creation date. PFA-1 is the oldest PFA issue.",
    "- legacyIdentifier is unique across the workspace and nullable — issues created in Spira simply have none.",
    "- GET /issue/COS-177 responds 308 to /issue/PFA-41. The old path never 404s, because hundreds of them live in " +
      "commit messages and PR descriptions.",
    "- Search matches both columns. Typing COS-177 lands on PFA-41 with the resolution shown, not a fuzzy title match.",
    "",
    "## Out of scope",
    "",
    "- Comment threads and issue relations — absent from the CSV export, taken by the raw GraphQL dump instead.",
    "",
    "```",
    "legacyIdentifier String? @unique @db.VarChar(16)",
    "```",
  ].join("\n"),

  "PFA-41": [
    "Sorti de PFA-22 (audit types/Zod front 2/2), reliquat du chantier 2. À ne pas faire tant qu'il n'y a pas de " +
      "déclencheur réel — un 3e formulaire de saisie de montant, ou le chantier multi-devises.",
    "",
    "## Déjà réglé, ne pas re-proposer",
    "",
    "L'objectif « messages FR dupliqués » du ticket d'origine est caduc : la copie de validation vit dans @text " +
      "(arbres fr + en). Les schémas sont des factories qui reçoivent une tranche de dictionnaire.",
    "",
    "## Ce qui reste",
    "",
    "- Renommer spendingLabel / spendingAmount / spendingDate en label / amount / date.",
    "- Extraire un makeMoneyEntrySchema(messages, { dateRequired }) partagé dans src/schemas/forms/.",
    "- Regrouper les paires de messages FR/EN identiques dans une tranche common.validation.",
  ].join("\n"),
};

/** [from, type, to] — read as "from blocks to" / "from is related to to". */
const RELATIONS: [string, "blocks" | "related", string][] = [
  ["SPI-34", "blocks", "SPI-24"],
  ["SPI-24", "blocks", "SPI-39"],
  ["SPI-2", "related", "SPI-34"],
];

// --------------------------------------------------------------------------
// CLI parsing
// --------------------------------------------------------------------------
class UsageError extends Error {}

interface SeedOptions {
  username: string;
  /** undefined = keep the stored hash, or mint one when the account is new. */
  password: string | undefined;
  wipe: boolean;
}

const USAGE = `Usage: pnpm seed -- [--username <name>] [--password <secret>] [--wipe]

  --username <name>    Account to seed. Defaults to $SEED_USERNAME, then ${DEFAULT_USERNAME}.
  --password <secret>  Set the account password. Defaults to $SEED_PASSWORD. When neither is
                       given, a new account gets a random ${GENERATED_PASSWORD_LENGTH}-character password, printed once
                       at the end; an existing account keeps the password it already has.
  --wipe               Delete the whole workspace (states, labels, projects, issues, relations,
                       saved views) before seeding. The account row is kept.

Examples:
  pnpm seed                                        # top the workspace back up
  pnpm seed -- --wipe                              # rebuild the demo data from scratch
  pnpm seed -- --username joe --password azerty    # a login you can actually type, for local dev`;

function parseArgs(argv: string[]): SeedOptions {
  let username: string | undefined;
  let password: string | undefined;
  let wipe = false;

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
        break; // pnpm forwards the `--` separator literally; ignore it
      case "--wipe":
        wipe = true;
        break;
      case "--username":
        username = nextVal();
        break;
      case "--password":
        password = nextVal();
        break;
      case "--help":
      case "-h":
        throw new UsageError("");
      default:
        throw new UsageError(`Unknown argument: ${a}`);
    }
  }

  const resolvedUsername = (username ?? process.env.SEED_USERNAME ?? DEFAULT_USERNAME).trim();
  const resolvedPassword = password ?? process.env.SEED_PASSWORD;
  if (!/^[\w.@-]{2,60}$/.test(resolvedUsername)) {
    throw new UsageError(`Invalid username "${resolvedUsername}" — 2 to 60 letters, digits, dot, dash, underscore or @.`);
  }
  if (resolvedPassword !== undefined && resolvedPassword.length < MIN_PASSWORD_LENGTH) {
    throw new UsageError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return { username: resolvedUsername, password: resolvedPassword, wipe };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
const projectKeyOf = (identifier: string): string => identifier.slice(0, identifier.lastIndexOf("-"));
const numberOf = (identifier: string): number => Number(identifier.slice(identifier.lastIndexOf("-") + 1));
const createdAt = (day: number): Date => new Date(Date.UTC(CREATED_YEAR, CREATED_MONTH, day, 9, 0, 0));

function generatePassword(): string {
  let out = "";
  for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i += 1) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

function highestNumberFor(projectKey: string): number {
  return ISSUES.reduce((max, row) => (projectKeyOf(row[0]) === projectKey ? Math.max(max, numberOf(row[0])) : max), 0);
}

/** Turns a typo in the tables above into a named failure instead of a null column. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Seed data is inconsistent: ${what}`);
  return value;
}

// --------------------------------------------------------------------------
// Seeding
// --------------------------------------------------------------------------
interface SeededUser {
  id: string;
  username: string;
  /** Set only when this run minted one — printed once, then unrecoverable. */
  generatedPassword: string | null;
  /** True when this run wrote a password: generated, or given with --password. */
  passwordWasSet: boolean;
}

async function seedUser(prisma: PrismaClient, username: string, password: string | undefined): Promise<SeededUser> {
  const existing = await prisma.user.findUnique({ where: { username } });

  // Spira has exactly one account, so a re-run that forgot --username must not
  // quietly mint a second one alongside the real owner. Refuse instead, and say
  // which address the workspace already belongs to.
  if (!existing) {
    const other = await prisma.user.findFirst();
    if (other) {
      throw new Error(
        `This workspace already belongs to ${other.username}. Spira is single-user: re-run with ` +
          `--username ${other.username} (optionally --password) to reseed it, or delete that account first.`,
      );
    }
  }

  // An explicit password always wins — it doubles as a reset. Without one we
  // only mint a password for an account that does not exist yet: a plain
  // re-run must not lock the owner out of the account it seeded last time.
  if (existing && !password) {
    return { id: existing.id, username: existing.username, generatedPassword: null, passwordWasSet: false };
  }

  const generated = password ? null : generatePassword();
  const passwordHash = await hash(password ?? (generated as string), BCRYPT_ROUNDS);
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { id: randomUUID(), username, passwordHash },
  });
  return { id: user.id, username: user.username, generatedPassword: generated, passwordWasSet: true };
}

async function seedStates(prisma: PrismaClient): Promise<Map<StateKey, string>> {
  const ids = new Map<StateKey, string>();
  for (const [position, state] of STATES.entries()) {
    // WorkflowState.name carries no unique index, so the natural key has to be
    // matched by hand rather than through upsert().
    const existing = await prisma.workflowState.findFirst({ where: { name: state.name } });
    const data = { name: state.name, type: state.type, color: state.color, position };
    const row = existing
      ? await prisma.workflowState.update({ where: { id: existing.id }, data })
      : await prisma.workflowState.create({ data: { id: randomUUID(), ...data } });
    ids.set(state.key, row.id);
  }
  return ids;
}

async function seedLabels(prisma: PrismaClient): Promise<Map<LabelKey, string>> {
  const ids = new Map<LabelKey, string>();
  for (const label of LABELS) {
    const row = await prisma.label.upsert({
      where: { name: label.name },
      update: { color: label.color },
      create: { id: randomUUID(), name: label.name, color: label.color },
    });
    ids.set(label.key, row.id);
  }
  return ids;
}

async function seedProjects(prisma: PrismaClient, stateIds: Map<StateKey, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [position, project] of PROJECTS.entries()) {
    const existing = await prisma.project.findUnique({ where: { key: project.key } });
    // Never lower the counter: a real create may already have gone past the
    // seeded rows, and handing the same number out twice collides on
    // Issue.identifier.
    const issueCounter = Math.max(existing?.issueCounter ?? 0, highestNumberFor(project.key));
    const data = {
      name: project.name,
      icon: project.icon,
      color: project.color,
      summary: project.summary,
      description: PROJECT_DESCRIPTIONS[project.key] ?? null,
      statusId: must(stateIds.get(project.status), `no state "${project.status}" for project ${project.key}`),
      priority: project.priority,
      issueCounter,
      position,
    };
    const row = await prisma.project.upsert({
      where: { key: project.key },
      update: data,
      create: { id: randomUUID(), key: project.key, ...data },
    });
    ids.set(project.key, row.id);
  }
  return ids;
}

async function seedIssues(
  prisma: PrismaClient,
  projectIds: Map<string, string>,
  stateIds: Map<StateKey, string>,
  labelIds: Map<LabelKey, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const sortOrders = new Map<string, number>();
  const labelPairs: { issueId: string; labelId: string }[] = [];

  for (const [identifier, legacyIdentifier, title, stateKey, priority, labels, day, , isEpic] of ISSUES) {
    const projectKey = projectKeyOf(identifier);
    const created = createdAt(day);
    const sortOrder = (sortOrders.get(projectKey) ?? 0) + SORT_ORDER_STEP;
    sortOrders.set(projectKey, sortOrder);

    const data = {
      projectId: must(projectIds.get(projectKey), `no project ${projectKey} for issue ${identifier}`),
      number: numberOf(identifier),
      legacyIdentifier,
      title,
      description: DESCRIPTIONS[identifier] ?? null,
      stateId: must(stateIds.get(stateKey), `no state "${stateKey}" for issue ${identifier}`),
      priority,
      isEpic: isEpic ?? false,
      // Written in a second pass, once every row has an id.
      epicId: null,
      sortOrder,
      createdAt: created,
      completedAt: stateKey === "done" ? created : null,
      canceledAt: stateKey === "canceled" ? created : null,
      archivedAt: null,
    };
    const row = await prisma.issue.upsert({
      where: { identifier },
      update: data,
      create: { id: randomUUID(), identifier, ...data },
    });
    ids.set(identifier, row.id);

    for (const labelKey of labels) {
      labelPairs.push({
        issueId: row.id,
        labelId: must(labelIds.get(labelKey), `no label "${labelKey}" for issue ${identifier}`),
      });
    }
  }

  for (const [identifier, , , , , , , epicIdentifier] of ISSUES) {
    if (!epicIdentifier) continue;
    await prisma.issue.update({
      where: { identifier },
      data: { epicId: must(ids.get(epicIdentifier), `unknown epic ${epicIdentifier} on ${identifier}`) },
    });
  }

  await prisma.issueLabel.createMany({ data: labelPairs, skipDuplicates: true });
  return ids;
}

async function seedRelations(prisma: PrismaClient, issueIds: Map<string, string>): Promise<void> {
  const rows = RELATIONS.map(([from, type, to]) => {
    let fromIssueId = must(issueIds.get(from), `unknown issue ${from} in a relation`);
    let toIssueId = must(issueIds.get(to), `unknown issue ${to} in a relation`);
    // `related` is symmetric — normalise on the lower id so the pair is stored once.
    if (type === "related" && fromIssueId > toIssueId) {
      [fromIssueId, toIssueId] = [toIssueId, fromIssueId];
    }
    return { id: randomUUID(), fromIssueId, toIssueId, type };
  });
  await prisma.issueRelation.createMany({ data: rows, skipDuplicates: true });
}

async function wipeWorkspace(prisma: PrismaClient): Promise<void> {
  // Foreign-key-safe order. The account row is deliberately kept: a rebuild
  // must not invalidate the password an earlier run printed.
  const relations = await prisma.issueRelation.deleteMany();
  const issueLabels = await prisma.issueLabel.deleteMany();
  const comments = await prisma.comment.deleteMany();
  const issues = await prisma.issue.deleteMany();
  const views = await prisma.savedView.deleteMany();
  const projects = await prisma.project.deleteMany();
  const states = await prisma.workflowState.deleteMany();
  const labels = await prisma.label.deleteMany();
  console.log(
    `  wiped: relations=${relations.count} issueLabels=${issueLabels.count} comments=${comments.count} ` +
      `issues=${issues.count} views=${views.count} projects=${projects.count} states=${states.count} ` +
      `labels=${labels.count} (account kept)`,
  );
}

// --------------------------------------------------------------------------
// Summary
// --------------------------------------------------------------------------
async function printSummary(prisma: PrismaClient, user: SeededUser): Promise<void> {
  console.log("\n=== SUMMARY ===");
  console.log("Rows:", {
    users: await prisma.user.count(),
    states: await prisma.workflowState.count(),
    labels: await prisma.label.count(),
    projects: await prisma.project.count(),
    issues: await prisma.issue.count(),
    issueLabels: await prisma.issueLabel.count(),
    relations: await prisma.issueRelation.count(),
  });

  const projects = await prisma.project.findMany({
    orderBy: { position: "asc" },
    select: { key: true, name: true, issueCounter: true, _count: { select: { issues: true } } },
  });
  for (const p of projects) {
    const issues = String(p._count.issues).padStart(3);
    console.log(`  ${p.key.padEnd(3)} ${issues} issues · next identifier ${p.key}-${p.issueCounter + 1}  ${p.name}`);
  }

  console.log(`\nAccount: ${user.username}`);
  if (user.generatedPassword) {
    console.log(`Password: ${user.generatedPassword}`);
    console.log("Shown once — only its bcrypt hash is stored. Re-run with --password to set another.");
  } else if (user.passwordWasSet) {
    console.log("Password: set from --password (or $SEED_PASSWORD).");
  } else {
    console.log("Password: unchanged — pass --password to set a new one.");
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main(): Promise<void> {
  let opts: SeedOptions;
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

  const prisma = makePrisma();
  try {
    console.log(`Seeding ${opts.username}\n  mode: ${opts.wipe ? "WIPE + rebuild" : "upsert (non-destructive)"}`);

    if (opts.wipe) {
      console.log("Wiping the workspace...");
      await wipeWorkspace(prisma);
    }

    const user = await seedUser(prisma, opts.username, opts.password);
    const stateIds = await seedStates(prisma);
    const labelIds = await seedLabels(prisma);
    const projectIds = await seedProjects(prisma, stateIds);
    const issueIds = await seedIssues(prisma, projectIds, stateIds, labelIds);
    await seedRelations(prisma, issueIds);

    await printSummary(prisma, user);
    console.log("\nDone.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
