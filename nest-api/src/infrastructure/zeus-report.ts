/**
 * Zeus cron reporting — the client every app on ks-b copies (COS-398).
 *
 * This is PFA's `nest-api/src/infrastructure/zeus-report.ts`, copied. Keep it that way: the only
 * edits below are to the install notes, because Spira has no `.env` to put these in.
 *
 * ## Why this is copied rather than installed
 *
 * Six consumers, six separate repos, one VPS. A published package would need a registry, an auth
 * token on the box at install time, and a release whenever this file changes — overhead bought
 * before there is any drift to prevent. The day a second event type ships (deploy reporting), the
 * upgrade path is a git dependency: `"@1991/zeus-report": "github:<owner>/zeus-report#v1.0.0"`,
 * with no change to the wire contract and no app rewritten.
 *
 * **The standard is the HTTP contract, not this file.** Zeus validates every field and answers
 * `400 <field>` to anything off-contract, which is what actually keeps six apps speaking the same
 * language — and it is the only thing that can, since the deploy script will report over `curl`
 * from bash. If this helper and Zeus ever disagree, Zeus is right.
 *
 * ## Install
 *
 * 1. Copy this file into the app, e.g. `src/infrastructure/zeus-report.ts`.
 * 2. Add the three variables to whatever supplies the app's `process.env`. For Spira that is
 *    `nest-api/ecosystem.config.js` — gitignored, kept on your machine, scp'd to ks-b by
 *    `deploy-api.sh` — and never a `.env`, which the API stopped reading:
 *
 *        ZEUS_INGEST_URL: "http://127.0.0.1:6600/api/cron-runs",
 *        ZEUS_INGEST_TOKEN: "<the same value as Zeus's own ZEUS_INGEST_TOKEN>",
 *        ZEUS_APP_NAME: "<the app's slug in the Zeus port registry>",
 *
 *    `ZEUS_APP_NAME` must already exist in the registry — Zeus rejects an unknown app. Crons need
 *    no registration at all: one appears the first time it reports.
 * 3. Wrap the job. Nothing else changes.
 *
 *        @Cron('0 6 * * *')
 *        async refreshForecasts() {
 *          await withZeusReport('daily-forecast-refresh', '0 6 * * *', async () => {
 *            const cities = await this.refreshAll();
 *            return cities.length === 0
 *              ? { status: 'skipped', summary: 'nothing to refresh' }
 *              : { summary: `refreshed ${cities.length} cities`, detail: { cities: cities.length } };
 *          });
 *        }
 *
 * ## The three rules this file exists to enforce
 *
 * 1. **Reporting must never fail the job.** Every network error, timeout and non-2xx is swallowed.
 *    Zeus being down cannot break Spira's backup.
 * 2. **Fire and forget, 2s timeout, no retries.** No retries also means no duplicate reports, which
 *    is why Zeus needs no idempotency key.
 * 3. **A thrown job is reported `failed` and then rethrown**, so the app's own error handling is
 *    unchanged. Only a hard process crash goes unreported — and passing `schedule` is what lets
 *    Zeus catch that one as overdue.
 */

const TIMEOUT_MS = 2000;

/**
 * Read at call time, never at module load.
 *
 * Under Nest this is the difference between working and silently doing nothing. `ConfigModule`
 * loads `.env` when the module is instantiated, which is *after* every import in the file tree has
 * been evaluated — so a `const TOKEN = process.env.ZEUS_INGEST_TOKEN` at the top of this file reads
 * `undefined` in local development. In production it would work, because pm2 injects the variables
 * into the process before node starts. An unconfigured client no-ops by design, so the two
 * environments would disagree in the quietest possible way: nothing reported locally, no error
 * anywhere, and the difference invisible until someone wondered why `/cron` only ever fills up
 * from the server.
 */
const settings = () => ({
  url: process.env.ZEUS_INGEST_URL ?? "http://127.0.0.1:6600/api/cron-runs",
  token: process.env.ZEUS_INGEST_TOKEN,
  app: process.env.ZEUS_APP_NAME,
});

/** `skipped` means the job ran and found nothing to do — healthy, and not the same as `ok`. */
export type ZeusCronStatus = "ok" | "failed" | "skipped";

export interface ZeusCronOutcome {
  status?: ZeusCronStatus;
  /** One human line, 200 chars max. Zeus rejects longer rather than truncating. */
  summary?: string;
  /** Free-form JSON, 4 KB max serialised. Same rule: rejected, never trimmed. */
  detail?: unknown;
}

const report = async (body: Record<string, unknown>): Promise<void> => {
  const { url, token, app } = settings();

  // Unconfigured is a silent no-op, deliberately: an app should run identically on a laptop with
  // no Zeus in sight and on ks-b with one.
  if (!token || !app) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ app, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Never propagates. This is the whole point of the wrapper.
  }
};

/**
 * Runs `fn` and reports the outcome to Zeus once, when it ends.
 *
 * `schedule` is the string from the job's own `@Cron()`, copied verbatim. It is optional to Zeus,
 * and passing it is what buys overdue detection: without it a cron that stops firing simply stops
 * appearing, which is exactly the failure this feature exists to catch.
 *
 * ## `timezone` — pass it if, and only if, your `@Cron` pins one
 *
 * A cron expression is a wall-clock time and means nothing without a zone. Omit this argument and
 * Zeus reads the schedule in `ZEUS_DEFAULT_TIMEZONE`, which is set to the box's own zone — `UTC`
 * on ks-b. That is the correct reading for the normal case, because a `@Cron()` with no
 * `timeZone` option fires in the process's zone, and the process runs on the box.
 *
 * But an app that pins one:
 *
 *     @Cron('0 8 * * *', { timeZone: 'Europe/Paris' })
 *
 * fires at 08:00 Paris — 06:00 UTC in summer — while Zeus, told only `'0 8 * * *'`, would expect
 * it at 08:00 UTC and flag it overdue for the two hours in between, every single day. So when the
 * decorator names a zone, pass the same string here:
 *
 *     await withZeusReport('daily-digest', '0 8 * * *', async () => { ... }, 'Europe/Paris');
 */
export const withZeusReport = async (
  cron: string,
  schedule: string,
  fn: () => Promise<ZeusCronOutcome | void>,
  timezone?: string,
): Promise<void> => {
  const startedAt = new Date();

  try {
    const outcome: ZeusCronOutcome = (await fn()) ?? {};

    await report({
      cron,
      schedule,
      timezone,
      status: outcome.status ?? "ok",
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      summary: outcome.summary,
      detail: outcome.detail,
    });
  } catch (error) {
    await report({
      cron,
      schedule,
      timezone,
      status: "failed",
      startedAt: startedAt.toISOString(),
      // 200 chars is the contract; a longer message would be rejected whole and the failure would
      // go unrecorded — the one report it is least acceptable to lose.
      summary: error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    });

    // Rethrown unchanged: reporting observes the job, it does not handle it.
    throw error;
  }
};
