"use client";

import { Button } from "@components/ui/button";
import useRequestHelper from "@helpers/useRequestHelper";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { ImportPreviewDto, ImportResultDto } from "@lib/api-types";

/** Big enough for any real export; refused here so a mistake costs no upload. */
const MAX_BYTES = 16 * 1024 * 1024;

/** How many rows of a repeated problem are shown before "and N more". */
const SAMPLE = 10;

/** What the user has to type to commit. Long enough not to be muscle memory. */
const CONFIRM_WORD = "import";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-125">
      <span className="text-ink-7">{label}</span>
      <span className="identifier text-ink-3">{value}</span>
    </div>
  );
}

/** A list that admits what it is not showing, rather than quietly stopping. */
function Some({ entries, className }: { entries: string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-1 ${className ?? ""}`}>
      {entries.slice(0, SAMPLE).map((entry) => (
        <li
          key={entry}
          className="text-125 leading-[1.5]"
        >
          {entry}
        </li>
      ))}
      {entries.length > SAMPLE && <li className="text-115 text-ink-8">and {entries.length - SAMPLE} more</li>}
    </ul>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "bad" | "warn" | "plain";
  children: React.ReactNode;
}) {
  const skin =
    tone === "bad"
      ? "border-danger/40 bg-danger/5 text-danger"
      : tone === "warn"
        ? "border-warn-line bg-warn-bg text-warn-ink"
        : "border-line bg-surface text-ink-4";

  return (
    <div className={`rounded-xl border p-3 ${skin}`}>
      <div className="mb-1.5 text-11 font-semibold tracking-section uppercase">{title}</div>
      {children}
    </div>
  );
}

/**
 * The Linear CSV import, from the browser (COS-455).
 *
 * The same two steps as `pnpm import:linear`, for the same reason: the dry run
 * computes the plan the commit will write, and nothing is written until it has
 * been read. The API recomputes the plan on commit and refuses if the file is
 * not the one the report describes, so nothing here is load-bearing for safety
 * — this is the reading surface, not the guard.
 *
 * It stays a one-shot cutover tool. The section says so, and the commit button
 * asks for a typed word, because a workspace can only be renumbered from 1 once.
 */
export function LinearImport() {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [sideFile, setSideFile] = useState<{ name: string; text: string } | null>(null);
  const [skipOrphans, setSkipOrphans] = useState(true);
  const [allowContinued, setAllowContinued] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const sideInput = useRef<HTMLInputElement>(null);

  const take = async (
    file: File | undefined,
    set: (value: { name: string; text: string } | null) => void,
  ): Promise<void> => {
    if (!file) {
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB, and the limit is 16 MB.`);
      return;
    }
    set({ name: file.name, text: await file.text() });
    // Any new file invalidates the report on screen, and with it the checksum
    // that would let a commit through.
    setPreview(null);
    setResult(null);
    setConfirm("");
    setError(null);
  };

  const dryRun = async () => {
    if (!csv) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await privateRequest<ImportPreviewDto>("/migration/linear/preview", {
        method: "POST",
        body: JSON.stringify({ csv: csv.text, sideFile: sideFile?.text, skipOrphans }),
      });
      setPreview(answer);
      setConfirm("");
    } catch (requestError) {
      setPreview(null);
      setError(requestError instanceof Error ? requestError.message : "The dry run failed.");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!csv || !preview) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await privateRequest<ImportResultDto>("/migration/linear/commit", {
        method: "POST",
        body: JSON.stringify({
          csv: csv.text,
          sideFile: sideFile?.text,
          skipOrphans,
          allowContinuedNumbering: allowContinued,
          checksum: preview.checksum,
        }),
      });
      setResult(answer);
      setPreview(null);
      toast.success(`${answer.issues} issues imported.`);
      // The sidebar, the projects list and every count on screen come from the
      // server render.
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The import failed. Nothing was written.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = preview !== null && preview.continuedNumbering.length > 0 && !allowContinued;
  const canCommit = preview !== null && preview.clean && !blocked && confirm.trim().toLowerCase() === CONFIRM_WORD;

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-[13px]">
        <div className="text-125 font-semibold text-ink-3">Import from Linear</div>
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5">
          <span className="size-[5px] rounded-full bg-warn" />
          <span className="text-105 text-ink-7">One-shot</span>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 p-4">
        <p className="text-125 leading-[1.55] text-ink-6">
          The CSV export of a Linear workspace, renumbered under Spira's project keys. Every issue keeps its old{" "}
          <span className="identifier text-ink-4">COS-</span> identifier, so links out there keep resolving. This is the
          cutover tool — it expects an empty workspace and it cannot be undone.
        </p>

        {/* ---------------------------------------------------------- files */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-115 text-ink-7">Linear CSV export</span>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void take(event.target.files?.[0], setCsv)}
              className="block w-full text-115 text-ink-6 file:mr-2.5 file:h-8 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-2.5 file:text-12 file:text-ink-3 hover:file:border-line-hover"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-115 text-ink-7">
              Side-file <span className="text-ink-8">· optional</span>
            </span>
            <input
              ref={sideInput}
              type="file"
              accept=".json,application/json"
              onChange={(event) => void take(event.target.files?.[0], setSideFile)}
              className="block w-full text-115 text-ink-6 file:mr-2.5 file:h-8 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-2.5 file:text-12 file:text-ink-3 hover:file:border-line-hover"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-125 text-ink-5">
          <input
            type="checkbox"
            checked={skipOrphans}
            onChange={(event) => {
              setSkipOrphans(event.target.checked);
              setPreview(null);
            }}
            className="mt-0.5"
          />
          <span>
            Skip issues that belong to no project.{" "}
            <span className="text-ink-7">
              Spira has no home for one, so without this a single abandoned onboarding ticket refuses the whole export.
              Every dropped row is listed below.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="xs"
            disabled={csv === null || busy}
            onClick={() => void dryRun()}
          >
            {busy && preview === null ? "Reading…" : "Dry run"}
          </Button>
          {csv && (
            <span className="truncate text-115 text-ink-7">
              {csv.name}
              {sideFile && ` · ${sideFile.name}`}
            </span>
          )}
        </div>

        {error && <p className="text-125 text-danger">{error}</p>}

        {/* --------------------------------------------------------- result */}
        {result && (
          <Panel
            title="Imported"
            tone="plain"
          >
            <div className="flex flex-col gap-1">
              <Row
                label="Issues"
                value={String(result.issues)}
              />
              <Row
                label="Projects"
                value={String(result.projects)}
              />
              <Row
                label="Labels"
                value={String(result.labels)}
              />
              {(result.relations > 0 || result.comments > 0) && (
                <Row
                  label="From the side-file"
                  value={`${result.relations} relations, ${result.comments} comments`}
                />
              )}
            </div>
          </Panel>
        )}

        {/* -------------------------------------------------------- preview */}
        {preview && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Row
                label="Into"
                value={preview.target}
              />
              <Row
                label="Rows read"
                value={String(preview.report.rowsRead)}
              />
              <Row
                label="Planned"
                value={String(preview.report.rowsPlanned)}
              />
              <Row
                label="Epics"
                value={`${preview.report.epics} · ${preview.report.epicChildren} children`}
              />
            </div>

            {preview.errors.length > 0 && (
              <Panel
                title={`${preview.errors.length} error${preview.errors.length === 1 ? "" : "s"} — nothing can be written`}
                tone="bad"
              >
                <Some entries={preview.errors} />
              </Panel>
            )}

            {preview.warnings.length > 0 && (
              <Panel
                title={`${preview.warnings.length} warning${preview.warnings.length === 1 ? "" : "s"}`}
                tone="warn"
              >
                <Some entries={preview.warnings} />
              </Panel>
            )}

            {preview.skippedOrphans && (
              <Panel
                title={`Orphans skipped (${preview.orphans.length})`}
                tone={preview.orphans.length > 0 ? "warn" : "plain"}
              >
                {preview.orphans.length === 0 ? (
                  <p className="text-125">Every row names a project, so this changed nothing.</p>
                ) : (
                  <>
                    <Some
                      entries={preview.orphans.map(
                        (orphan) => `line ${orphan.line}: ${orphan.id || "(no ID)"} ${orphan.title}`,
                      )}
                    />
                    <p className="mt-1.5 text-115">These will not exist in Spira at all. Read the list.</p>
                  </>
                )}
              </Panel>
            )}

            {preview.sideFile && (
              <Panel
                title="Side-file"
                tone={preview.sideFile.problems.length > 0 ? "warn" : "plain"}
              >
                <p className="text-125">
                  {preview.sideFile.relations} relations, {preview.sideFile.comments} comments
                </p>
                {preview.sideFile.problems.length > 0 && (
                  <>
                    <p className="mt-1.5 text-115">{preview.sideFile.problems.length} unusable entries skipped:</p>
                    <Some
                      entries={preview.sideFile.problems}
                      className="mt-1"
                    />
                  </>
                )}
              </Panel>
            )}

            <Panel
              title={`Projects (${preview.report.byProject.length})`}
              tone="plain"
            >
              <div className="flex flex-col gap-1">
                {preview.report.byProject.map((project) => (
                  <div
                    key={project.key}
                    className="flex items-baseline gap-2 text-125"
                  >
                    <span className="identifier w-12 flex-none text-ink-2">{project.key}</span>
                    <span className="w-16 flex-none text-ink-5">{project.count} issues</span>
                    <span className="identifier flex-none text-ink-7">
                      {project.first} → {project.last}
                    </span>
                    <span className="min-w-0 truncate text-ink-8">{project.names.join(", ")}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {preview.columns.unrecognised.length > 0 && (
              <Panel
                title={`Columns Spira does not know (${preview.columns.unrecognised.length})`}
                tone="plain"
              >
                <p className="identifier text-115 text-ink-7">{preview.columns.unrecognised.join(", ")}</p>
                <p className="mt-1.5 text-115">Never fatal — Linear adding a column is not a reason to refuse.</p>
              </Panel>
            )}

            {/* ------------------------------------------------------ commit */}
            {preview.clean ? (
              <div className="flex flex-col gap-2.5 rounded-xl border border-line-strong bg-field p-3">
                <p className="text-125 text-ink-3">
                  {preview.report.rowsPlanned} issues across {preview.report.byProject.length} projects are ready to be
                  written into <span className="text-ink-1">{preview.target}</span>.
                </p>

                {preview.continuedNumbering.length > 0 && (
                  <label className="flex items-start gap-2 text-125 text-danger">
                    <input
                      type="checkbox"
                      checked={allowContinued}
                      onChange={(event) => setAllowContinued(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      {preview.continuedNumbering
                        .map((project) => `${project.key} would start at ${project.key}-${project.from + 1}, not 1`)
                        .join("; ")}
                      . This is almost always the demo data from <span className="identifier">pnpm seed</span>. Clear it
                      and run again, or tick this to number on top of it — renumbering cannot be redone.
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder={`Type ${CONFIRM_WORD} to confirm`}
                    spellCheck={false}
                    aria-label={`Type ${CONFIRM_WORD} to confirm the import`}
                    className="h-8 w-[220px] rounded-lg border border-line bg-field px-2.5 text-125 text-ink-2 outline-none placeholder:text-ink-8 focus:border-line-focus"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    disabled={!canCommit || busy}
                    onClick={() => void commit()}
                  >
                    {busy ? "Writing…" : "Import"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-125 text-ink-6">
                Fix the errors above and run the dry run again. Nothing can be written while any remain.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
