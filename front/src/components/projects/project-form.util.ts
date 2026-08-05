import { RESERVED_PROJECT_KEYS } from "@components/shared/config/constants";
import { FIELD_LIMITS } from "@schemas/field-limits";

import type { ProjectDto } from "@lib/api-types";

/**
 * Everything the create/edit form holds, as the DOM holds it: strings, and an
 * empty string for "not set". Nothing here is `null` or `undefined` — the
 * conversion to the API's nullable shape happens once, in the payload builders
 * below, which is the only place that has to think about it.
 */
export interface ProjectFormValues {
  name: string;
  key: string;
  icon: string;
  color: string;
  summary: string;
  statusId: string;
  priority: number;
  /** `yyyy-mm-dd`, the value an `<input type="date">` reads and writes. */
  startDate: string;
  targetDate: string;
}

/** `#rrggbb`, which is all `<input type="color">` ever produces. */
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const KEY_PATTERN = /^[A-Z0-9]{2,5}$/;
const ALL_DIGITS = /^\d+$/;

/** The design's project colour, and a reasonable first suggestion. */
export const DEFAULT_PROJECT_COLOR = "#7b8fd8";

export const EMPTY_PROJECT: ProjectFormValues = {
  name: "",
  key: "",
  icon: "",
  color: DEFAULT_PROJECT_COLOR,
  summary: "",
  statusId: "",
  priority: 0,
  startDate: "",
  targetDate: "",
};

/** An ISO instant to the `yyyy-mm-dd` the date input wants. */
function toDateInput(iso: string | null): string {
  return iso === null ? "" : iso.slice(0, 10);
}

export function toFormValues(project: ProjectDto): ProjectFormValues {
  return {
    name: project.name,
    key: project.key,
    icon: project.icon ?? "",
    color: project.color ?? DEFAULT_PROJECT_COLOR,
    summary: project.summary ?? "",
    statusId: project.status.id,
    priority: project.priority,
    startDate: toDateInput(project.startDate),
    targetDate: toDateInput(project.targetDate),
  };
}

/**
 * The key rules, client side. Every one of them is enforced again by the API —
 * this copy exists so the owner reads the rule while typing rather than after
 * submitting, and its messages are deliberately the same ones the API sends.
 */
export function projectKeyError(key: string): string | null {
  const normalised = key.trim().toUpperCase();

  if (normalised === "") {
    return "A project needs a key — it becomes the prefix of every issue in it.";
  }
  if (!KEY_PATTERN.test(normalised)) {
    return "The key is 2 to 5 letters or digits, nothing else.";
  }
  if (ALL_DIGITS.test(normalised)) {
    return `"${normalised}" is all digits, so "${normalised}-1" would read as an issue number.`;
  }
  if ((RESERVED_PROJECT_KEYS as readonly string[]).includes(normalised)) {
    return `"${normalised}" is reserved by the app's own routes. Reserved: ${RESERVED_PROJECT_KEYS.join(", ")}.`;
  }
  return null;
}

export function projectNameError(name: string): string | null {
  const trimmed = name.trim();

  if (trimmed === "") {
    return "A project needs a name.";
  }
  if (trimmed.length > FIELD_LIMITS.projectName) {
    return `The name is at most ${FIELD_LIMITS.projectName} characters.`;
  }
  return null;
}

/**
 * The first error the form should show, in the order the fields are read.
 * `null` means the values are submittable.
 */
export function projectFormError(values: ProjectFormValues): string | null {
  const nameError = projectNameError(values.name);
  if (nameError) {
    return nameError;
  }

  const keyError = projectKeyError(values.key);
  if (keyError) {
    return keyError;
  }

  if (!COLOR_PATTERN.test(values.color)) {
    return "The colour must be a six-digit hex, like #7b8fd8.";
  }

  // Only an ordering check: either date may stand alone.
  if (values.startDate !== "" && values.targetDate !== "" && values.targetDate < values.startDate) {
    return "The target date falls before the start date.";
  }

  return null;
}

/** `""` is how the form says "no value"; the API says `null`. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface ProjectPayload {
  key?: string;
  name?: string;
  icon?: string | null;
  color?: string | null;
  summary?: string | null;
  statusId?: string;
  priority?: number;
  startDate?: string | null;
  targetDate?: string | null;
}

export function toCreatePayload(values: ProjectFormValues): ProjectPayload {
  return {
    key: values.key.trim().toUpperCase(),
    name: values.name.trim(),
    icon: orNull(values.icon),
    color: orNull(values.color),
    summary: orNull(values.summary),
    // Omitted rather than sent empty: the API then picks the first backlog
    // state itself, which is the right default and one it owns.
    ...(values.statusId === "" ? {} : { statusId: values.statusId }),
    priority: values.priority,
    startDate: orNull(values.startDate),
    targetDate: orNull(values.targetDate),
  };
}

/**
 * Only what changed. `PATCH /projects/:key` treats an absent field as "leave
 * it alone" and an explicit `null` as "clear it", so sending the whole form
 * back would work — but it would also overwrite a field someone edited in
 * another tab, and it would rename the project on every save, which the key
 * uniqueness check reads as a collision with itself.
 */
export function toUpdatePayload(values: ProjectFormValues, original: ProjectFormValues): ProjectPayload {
  const payload: ProjectPayload = {};
  const next = toCreatePayload(values);
  const before = toCreatePayload(original);

  if (next.key !== before.key) {
    payload.key = next.key;
  }
  if (next.name !== before.name) {
    payload.name = next.name;
  }
  if (next.icon !== before.icon) {
    payload.icon = next.icon;
  }
  if (next.color !== before.color) {
    payload.color = next.color;
  }
  if (next.summary !== before.summary) {
    payload.summary = next.summary;
  }
  if (values.statusId !== "" && values.statusId !== original.statusId) {
    payload.statusId = values.statusId;
  }
  if (next.priority !== before.priority) {
    payload.priority = next.priority;
  }
  if (next.startDate !== before.startDate) {
    payload.startDate = next.startDate;
  }
  if (next.targetDate !== before.targetDate) {
    payload.targetDate = next.targetDate;
  }

  return payload;
}

export function hasChanges(values: ProjectFormValues, original: ProjectFormValues): boolean {
  return Object.keys(toUpdatePayload(values, original)).length > 0;
}
