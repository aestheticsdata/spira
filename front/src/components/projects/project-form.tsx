"use client";

import {
  hasChanges,
  projectFormError,
  projectKeyError,
  toCreatePayload,
  toUpdatePayload,
} from "@components/projects/project-form.util";
import { ROUTES } from "@components/shared/config/constants";
import { Button } from "@components/ui/button";
import { ColorPicker } from "@components/ui/color-picker";
import { IconPicker } from "@components/ui/icon-picker";
import { StateIcon } from "@components/ui/state-icon";
import useRequestHelper from "@helpers/useRequestHelper";
import { PRIORITY_NAMES } from "@lib/status";
import { cn } from "@lib/utils";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ProjectFormValues } from "@components/projects/project-form.util";
import type { ProjectDto, WorkflowStateDto } from "@lib/api-types";

const FIELD =
  "h-8 w-full rounded-lg border border-line bg-field px-2.5 text-13 text-ink-2 outline-none placeholder:text-ink-8 focus:border-line-focus";

/** How long the key suggestion waits after the last keystroke. */
const SUGGEST_DELAY_MS = 300;

/**
 * Label, control, hint. `htmlFor` rather than wrapping the control: two of
 * these fields hold a second input beside the first (the colour swatch, the
 * icon preview), and a label wrapping both would claim both.
 */
function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-115 text-ink-7"
      >
        {label}
      </label>
      {children}
      {hint && <span className="text-11 text-ink-8">{hint}</span>}
    </div>
  );
}

/**
 * The project create and edit form.
 *
 * Plain `useState` rather than react-hook-form, which the password form uses:
 * the key field is not a field that is merely validated. It is suggested from
 * the name, keeps being suggested until the owner types one, then stops
 * forever — state a form library would have to be told about anyway, through
 * `watch` and `setValue` on every keystroke.
 *
 * `mode` is carried by whether `project` is present. Everything else — fields,
 * validation, layout — is shared, because a create form that drifts from the
 * edit form is how a field ends up settable but not changeable.
 */
export function ProjectForm({
  project,
  states,
  initial,
}: {
  /** Absent on create. */
  project?: ProjectDto;
  states: WorkflowStateDto[];
  initial: ProjectFormValues;
}) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();

  const [values, setValues] = useState<ProjectFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // An existing project already has a key its issues are named after; nothing
  // may quietly re-suggest one over it.
  const [keyTouched, setKeyTouched] = useState(project !== undefined);
  const nameInput = useRef<HTMLInputElement>(null);

  // `useRequestHelper` hands back a fresh closure on every render. Read through
  // a ref so the suggestion effect below depends on the typed name and nothing
  // else — listed as a dependency it would clear its own debounce timer on
  // every render and fire a request per keystroke.
  const requestRef = useRef(privateRequest);
  requestRef.current = privateRequest;

  const editing = project !== undefined;
  const dirty = editing ? hasChanges(values, initial) : true;

  useEffect(() => {
    if (!editing) {
      nameInput.current?.focus();
    }
  }, [editing]);

  // Ask the API for a key while the name is being typed. Debounced because it
  // is one request per keystroke otherwise, and abandoned on unmount so a late
  // answer cannot overwrite a key the owner has since typed by hand.
  useEffect(() => {
    if (keyTouched) {
      return;
    }

    const name = values.name.trim();
    if (name === "") {
      setValues((current) => ({ ...current, key: "" }));
      return;
    }

    let live = true;
    const timer = setTimeout(() => {
      requestRef
        .current<{ key: string }>(`/projects/suggest-key?name=${encodeURIComponent(name)}`)
        .then(({ key }) => {
          if (live) {
            setValues((current) => ({ ...current, key }));
            setKeyError(null);
          }
        })
        .catch(() => {
          // A failed suggestion is not a failed form: the field stays editable
          // and the API validates whatever is finally submitted.
        });
    }, SUGGEST_DELAY_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [values.name, keyTouched]);

  const set = <K extends keyof ProjectFormValues>(field: K, value: ProjectFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const onKeyChange = (raw: string) => {
    // Uppercased as it is typed: the key is stored uppercase, and showing it
    // any other way in the field promises something the API will not keep.
    const next = raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, FIELD_LIMITS.projectKey);
    setKeyTouched(true);
    setKeyError(next === "" ? null : projectKeyError(next));
    set("key", next);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const message = projectFormError(values);
    if (message) {
      setError(message);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (editing) {
        const payload = toUpdatePayload(values, initial);
        const saved = await privateRequest<ProjectDto>(`/projects/${project.key}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Project saved.");
        router.push(ROUTES.projectOverview.path(saved.key));
      } else {
        const saved = await privateRequest<ProjectDto>("/projects", {
          method: "POST",
          body: JSON.stringify(toCreatePayload(values)),
        });
        toast.success(`${saved.key} created.`);
        router.push(ROUTES.projectOverview.path(saved.key));
      }
      router.refresh();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "The project could not be saved.";
      // A taken key is a key problem, not a form problem — say it on the field.
      if (/key/i.test(message)) {
        setKeyError(message);
      }
      setError(message);
      setBusy(false);
    }
  };

  const onArchive = async () => {
    if (!project) {
      return;
    }

    setBusy(true);
    try {
      await privateRequest<ProjectDto>(`/projects/${project.key}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: project.archivedAt === null }),
      });
      toast.success(project.archivedAt === null ? "Project archived." : "Project restored.");
      router.push(ROUTES.projects.path);
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The project could not be archived.");
      setBusy(false);
    }
  };

  const selectedState = states.find((state) => state.id === values.statusId);

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-[30px]"
    >
      <section className="overflow-hidden rounded-2xl border border-line">
        <div className="border-b border-line bg-surface px-4 py-[13px] text-125 font-semibold text-ink-3">Identity</div>

        <div className="flex flex-col gap-3.5 p-4">
          <Field
            id="project-name"
            label="Name"
          >
            <input
              id="project-name"
              ref={nameInput}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              maxLength={FIELD_LIMITS.projectName}
              placeholder="Spira"
              className={FIELD}
            />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-[150px_1fr]">
            <Field
              id="project-key"
              label="Key"
              hint={keyTouched ? undefined : "Suggested from the name until you type one."}
            >
              <input
                id="project-key"
                value={values.key}
                onChange={(event) => onKeyChange(event.target.value)}
                spellCheck={false}
                autoCapitalize="characters"
                placeholder="SPI"
                aria-invalid={keyError !== null}
                className={`${FIELD} identifier tracking-key`}
              />
            </Field>

            <div className="flex flex-col justify-center gap-1.5 pt-[22px]">
              <div className="flex items-center gap-2 text-125 text-ink-6">
                <span>First issue will be</span>
                <span className="identifier rounded-[5px] border border-line px-1.5 py-0.5 text-12 text-ink-2">
                  {values.key === "" ? "—" : `${values.key}-${(project?.issueCounter ?? 0) + 1}`}
                </span>
              </div>
              {keyError && <p className="text-11 text-danger">{keyError}</p>}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-[1fr_150px]">
            <Field
              id="project-icon"
              label="Icon"
              hint="Every Material Symbols glyph and every emoji, searchable — nothing to type."
            >
              <div className="flex items-center gap-2.5">
                <IconPicker
                  id="project-icon"
                  value={values.icon}
                  onChange={(icon) => set("icon", icon)}
                  color={values.color}
                  onColorChange={(color) => set("color", color)}
                  label="Choose the project icon"
                />
                {/* The stored value, shown because it is what the API holds and
                    what the seeder and the importer write — not because anyone
                    has to type it. */}
                <span className={cn("truncate text-125", values.icon === "" ? "text-ink-8" : "identifier text-ink-5")}>
                  {values.icon === "" ? "None — a folder is drawn instead" : values.icon}
                </span>
              </div>
            </Field>

            <Field
              id="project-color"
              label="Colour"
            >
              <div className="flex items-center gap-2.5">
                <ColorPicker
                  value={values.color}
                  onChange={(color) => set("color", color)}
                />
                <input
                  id="project-color"
                  aria-label="Project colour, hexadecimal"
                  value={values.color}
                  onChange={(event) => set("color", event.target.value)}
                  spellCheck={false}
                  className={`${FIELD} identifier text-11`}
                />
              </div>
            </Field>
          </div>

          <Field
            id="project-summary"
            label="Summary"
            hint="One line, shown on the projects list and under the title."
          >
            <input
              id="project-summary"
              value={values.summary}
              onChange={(event) => set("summary", event.target.value)}
              maxLength={FIELD_LIMITS.summary}
              placeholder="Self-hosted Linear replacement"
              className={FIELD}
            />
          </Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line">
        <div className="border-b border-line bg-surface px-4 py-[13px] text-125 font-semibold text-ink-3">Planning</div>

        <div className="grid gap-3.5 p-4 sm:grid-cols-2">
          <Field
            id="project-status"
            label="Status"
          >
            <div className="flex items-center gap-2.5">
              {/* The ring beside the select is the same glyph the lists use, so
                  the status reads identically here and on the projects page. */}
              {selectedState && (
                <span className="grid size-8 flex-none place-items-center rounded-lg border border-line bg-field">
                  <StateIcon
                    state={selectedState}
                    size={12}
                  />
                </span>
              )}
              <select
                id="project-status"
                value={values.statusId}
                onChange={(event) => set("statusId", event.target.value)}
                className={FIELD}
              >
                {states.map((state) => (
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
            id="project-priority"
            label="Priority"
          >
            <select
              id="project-priority"
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

          <Field
            id="project-start-date"
            label="Start date"
          >
            <input
              type="date"
              id="project-start-date"
              value={values.startDate}
              onChange={(event) => set("startDate", event.target.value)}
              className={FIELD}
            />
          </Field>

          <Field
            id="project-target-date"
            label="Target date"
          >
            <input
              type="date"
              id="project-target-date"
              value={values.targetDate}
              onChange={(event) => set("targetDate", event.target.value)}
              className={FIELD}
            />
          </Field>
        </div>
      </section>

      {error && <p className="text-125 text-danger">{error}</p>}

      <div className="flex items-center gap-2.5">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create project"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => router.back()}
        >
          Cancel
        </Button>

        {editing && (
          <>
            <div className="flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              className="text-115 text-ink-7 hover:text-ink-4 disabled:opacity-50"
            >
              {project.archivedAt === null ? "Archive project" : "Restore project"}
            </button>
          </>
        )}
      </div>

      {editing && (
        <p className="text-11 text-ink-8">
          Changing the key renames future issues only. {project.key}-1 and every identifier already allocated keep their
          name — they are stored, not derived, so the links out there keep working.
        </p>
      )}
    </form>
  );
}
