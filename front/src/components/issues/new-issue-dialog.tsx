"use client";

import { EMPTY_ISSUE, issueFormError, toCreateIssuePayload, toggleLabel } from "@components/issues/issue-form.util";
import { MarkdownEditor } from "@components/markdown/markdown-editor";
import { ROUTES } from "@components/shared/config/constants";
import { Button } from "@components/ui/button";
import { EpicGlyph } from "@components/ui/epic-glyph";
import { LabelChip } from "@components/ui/label-chip";
import { ProjectIcon } from "@components/ui/project-icon";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import { PRIORITY_NAMES } from "@lib/status";
import { cn } from "@lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { IssueFormValues } from "@components/issues/issue-form.util";
import type { IssueDetailDto, IssueListItemDto, LabelDto, ProjectSummaryDto, WorkflowStateDto } from "@lib/api-types";

const FIELD =
  "h-8 w-full rounded-lg border border-line bg-field px-2.5 text-13 text-ink-2 outline-none placeholder:text-ink-8 focus:border-line-focus";

/** One `[label][control]` column of the property grid. */
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-115 text-ink-7"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The same thing for a field whose control is several buttons rather than one
 * element. A `<legend>` is what names a group of controls; a `<label htmlFor>`
 * pointing at the wrapping `<div>` would name nothing.
 */
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-115 text-ink-7">{label}</legend>
      {children}
    </fieldset>
  );
}

/**
 * The full issue creator.
 *
 * A dialog rather than a page, unlike the project form: filing an issue is
 * something you do from wherever you already are, and the point of `c` is that
 * it does not cost you your place in the list. The project form is a page
 * because creating a project is a deliberate trip, not an interruption.
 *
 * Every property `POST /issues` accepts is here, so nothing is settable only
 * after the fact. The quick-add on the list is the other half of the pair: this
 * one is for an issue you have something to say about, that one for an issue
 * you only have a title for.
 */
export function NewIssueDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectSummaryDto[];
  /** The project the owner is looking at, when they are looking at one. */
  defaultProjectKey?: string;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [values, setValues] = useState<IssueFormValues>(EMPTY_ISSUE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  // Read through a ref so the reset below depends on `open` alone. `projects`
  // is a fresh array on every server render, and listed as a dependency it
  // would wipe a half-written issue the next time the list refreshed.
  const seedRef = useRef({ defaultProjectKey, projects });
  seedRef.current = { defaultProjectKey, projects };

  // Opening is what resets the form, not closing: a dialog that clears itself
  // on the way out flashes an empty form during the close animation.
  useEffect(() => {
    if (!open) {
      return;
    }
    const { defaultProjectKey: preferred, projects: available } = seedRef.current;
    setValues({ ...EMPTY_ISSUE, projectKey: preferred ?? available[0]?.key ?? "" });
    setError(null);
    setBusy(false);
  }, [open]);

  // None of the three throws. Queries throw by default here, and this dialog
  // lives in the sidebar on every authenticated page — a 500 from `/labels`
  // would take the whole app to error.tsx rather than costing the owner a row
  // of chips. Each one degrades to an empty list instead, and the API still
  // validates whatever is finally submitted.
  const { data: states } = useQuery({
    queryKey: ["states"],
    queryFn: () => privateRequest<WorkflowStateDto[]>("/states"),
    enabled: open,
    throwOnError: false,
  });

  const { data: labels } = useQuery({
    queryKey: ["labels"],
    queryFn: () => privateRequest<LabelDto[]>("/labels"),
    enabled: open,
    throwOnError: false,
  });

  // Only the chosen project's epics: `epicId` must point at an epic in the same
  // project, so offering the others would only produce a 400.
  const { data: epics } = useQuery({
    queryKey: ["epics", values.projectKey],
    queryFn: () =>
      privateRequest<IssueListItemDto[]>(`/issues?project=${encodeURIComponent(values.projectKey)}&isEpic=true`),
    enabled: open && values.projectKey !== "",
    throwOnError: false,
  });

  const set = <K extends keyof IssueFormValues>(field: K, value: IssueFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  // The API falls back to the first state by position when none is sent. The
  // select shows that same state rather than a blank, so what the dialog says
  // and what the service does cannot disagree.
  const ordered = [...(states ?? [])].sort((a, b) => a.position - b.position);
  const effectiveStateId = values.stateId || (ordered[0]?.id ?? "");
  const selectedState = ordered.find((state) => state.id === effectiveStateId);
  const selectedProject = projects.find((project) => project.key === values.projectKey);

  const onSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const message = issueFormError(values);
    if (message) {
      setError(message);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const created = await privateRequest<IssueDetailDto>("/issues", {
        method: "POST",
        body: JSON.stringify(toCreateIssuePayload(values)),
      });
      toast.success(`${created.identifier} created.`);
      onOpenChange(false);
      // Straight to the issue: the description is already written, so what the
      // owner wants next is to look at it. The list's quick-add makes the other
      // choice, and stays put.
      router.push(ROUTES.issue.path(created.identifier));
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The issue could not be created.");
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(8,9,11,.66)] backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Radix would land on the project select, the first focusable thing
            // in the dialog. The title is what one came here to type.
            event.preventDefault();
            titleInput.current?.focus();
          }}
          // 900px is not a round number for its own sake: its content box
          // clears the 768px the editor's container query needs, so this is the
          // one place in the app where §8's "preview beside it" is literally
          // true. Under a ~840px window `max-w` takes over, the content box
          // drops below 768, and the two panes stack — the same thing they do
          // in the issue page's narrower column.
          className="fixed top-[76px] left-1/2 z-50 flex max-h-[calc(100vh-152px)] w-[900px] max-w-[calc(100vw-40px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-line-overlay bg-overlay shadow-[0_24px_70px_rgba(0,0,0,.6)]"
        >
          <form
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex h-12 flex-none items-center gap-2.5 border-b border-line px-4">
              <Dialog.Title className="text-13 font-semibold text-ink-2">New issue</Dialog.Title>
              <span className="text-ink-9">·</span>

              <label
                htmlFor="issue-project"
                className="sr-only"
              >
                Project
              </label>
              <div className="flex items-center gap-2">
                {selectedProject && (
                  <ProjectIcon
                    project={selectedProject}
                    size={17}
                    glyph={15}
                  />
                )}
                <select
                  id="issue-project"
                  value={values.projectKey}
                  onChange={(event) => {
                    // The epic list belongs to the old project; keeping it would
                    // send a parent from somewhere else.
                    setValues((current) => ({ ...current, projectKey: event.target.value, epicId: "" }));
                    setError(null);
                  }}
                  className="h-7 rounded-md border border-line bg-field px-2 text-12 text-ink-3 outline-none focus:border-line-focus"
                >
                  {projects.map((project) => (
                    <option
                      key={project.id}
                      value={project.key}
                    >
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1" />
              <span className="identifier rounded-sm border border-line px-[5px] py-0.5 text-10 text-ink-8">esc</span>
            </div>

            <div className="sp-scroll min-h-0 flex-1 overflow-y-auto p-4">
              <label
                htmlFor="issue-title"
                className="sr-only"
              >
                Title
              </label>
              <input
                id="issue-title"
                ref={titleInput}
                value={values.title}
                onChange={(event) => set("title", event.target.value)}
                maxLength={FIELD_LIMITS.issueTitle}
                placeholder="Issue title"
                className="mb-3.5 w-full bg-transparent text-16 leading-[1.3] font-semibold tracking-title text-ink-1 outline-none placeholder:font-normal placeholder:text-ink-8"
              />

              <MarkdownEditor
                value={values.description}
                onChange={(description) => set("description", description)}
                onSave={onSubmit}
                onCancel={() => onOpenChange(false)}
                busy={busy}
                minRows={7}
                autoFocus={false}
                showActions={false}
                placeholder="Description — markdown, and SPI-24 becomes a link."
              />

              <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                <Field
                  id="issue-status"
                  label="Status"
                >
                  <div className="flex items-center gap-2.5">
                    {selectedState && (
                      <span className="grid size-8 flex-none place-items-center rounded-lg border border-line bg-field">
                        <StateIcon
                          state={selectedState}
                          size={12}
                        />
                      </span>
                    )}
                    <select
                      id="issue-status"
                      value={effectiveStateId}
                      onChange={(event) => set("stateId", event.target.value)}
                      disabled={ordered.length === 0}
                      className={FIELD}
                    >
                      {ordered.map((state) => (
                        <option
                          key={state.id}
                          value={state.id}
                        >
                          {state.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field
                  id="issue-priority"
                  label="Priority"
                >
                  <select
                    id="issue-priority"
                    value={values.priority}
                    onChange={(event) => set("priority", Number(event.target.value))}
                    className={FIELD}
                  >
                    {PRIORITY_NAMES.map((name, priority) => (
                      <option
                        key={name}
                        value={priority}
                      >
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>

                <FieldGroup label="Type">
                  <div className="flex h-8 items-center gap-1 rounded-lg border border-line bg-field p-1">
                    {[false, true].map((epic) => (
                      <button
                        key={String(epic)}
                        type="button"
                        aria-pressed={values.isEpic === epic}
                        // An epic cannot have a parent, so choosing Epic drops
                        // one that was already picked rather than leaving the
                        // form in a state only the API can reject.
                        onClick={() => setValues((current) => ({ ...current, isEpic: epic, epicId: "" }))}
                        className={cn(
                          "flex h-full flex-1 items-center justify-center gap-1.5 rounded-md text-12",
                          values.isEpic === epic ? "bg-surface-active text-ink-1" : "text-ink-6 hover:text-ink-3",
                        )}
                      >
                        {/* Decorative here: `EpicGlyph` labels itself "Epic",
                            and beside the word it would name the button
                            "Epic Epic". */}
                        <span aria-hidden="true">
                          {epic ? (
                            <EpicGlyph size={11} />
                          ) : (
                            <span className="block size-[11px] rounded-[3px] border-[1.5px] border-glyph" />
                          )}
                        </span>
                        {epic ? "Epic" : "Issue"}
                      </button>
                    ))}
                  </div>
                </FieldGroup>

                <Field
                  id="issue-epic"
                  label="Epic"
                >
                  <select
                    id="issue-epic"
                    value={values.epicId}
                    onChange={(event) => set("epicId", event.target.value)}
                    disabled={values.isEpic || (epics ?? []).length === 0}
                    className={FIELD}
                  >
                    <option value="">
                      {values.isEpic ? "An epic has no parent" : (epics ?? []).length === 0 ? "No epic here yet" : "—"}
                    </option>
                    {!values.isEpic &&
                      (epics ?? []).map((epic) => (
                        <option
                          key={epic.id}
                          value={epic.id}
                        >
                          {epic.identifier} · {epic.title}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>

              {(labels ?? []).length > 0 && (
                <div className="mt-3.5">
                  <FieldGroup label="Labels">
                    <div className="flex flex-wrap gap-1.5">
                      {(labels ?? []).map((label) => {
                        const selected = values.labelIds.includes(label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => set("labelIds", toggleLabel(values.labelIds, label.id))}
                            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <LabelChip
                              label={label}
                              className={cn(
                                selected ? "border-line-focus bg-surface-active text-ink-1" : "hover:border-line-hover",
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </FieldGroup>
                </div>
              )}

              {error && <p className="mt-3.5 text-125 text-danger">{error}</p>}
            </div>

            <div className="flex h-14 flex-none items-center gap-2.5 border-t border-line px-4">
              <div className="flex-1" />
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="xs"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create issue"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
