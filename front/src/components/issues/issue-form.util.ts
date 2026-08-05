import { FIELD_LIMITS } from "@schemas/field-limits";

/**
 * What the create form holds, as the DOM holds it — strings, and an empty
 * string for "not set". The same shape backs both creators: the dialog fills
 * all of it, the list's quick-add fills a title and whatever its group implies,
 * so there is one validator and one payload builder rather than two that drift.
 *
 * Nothing here is nullable. The conversion to the API's optional shape happens
 * once, in `toCreateIssuePayload`.
 */
export interface IssueFormValues {
  projectKey: string;
  title: string;
  description: string;
  stateId: string;
  priority: number;
  isEpic: boolean;
  epicId: string;
  labelIds: string[];
}

export const EMPTY_ISSUE: IssueFormValues = {
  projectKey: "",
  title: "",
  description: "",
  stateId: "",
  priority: 0,
  isEpic: false,
  epicId: "",
  labelIds: [],
};

export function issueTitleError(title: string): string | null {
  const trimmed = title.trim();

  if (trimmed === "") {
    return "An issue needs a title.";
  }
  if (trimmed.length > FIELD_LIMITS.issueTitle) {
    return `The title is at most ${FIELD_LIMITS.issueTitle} characters.`;
  }
  return null;
}

/**
 * The first error the form should show, in the order the fields are read.
 * `null` means the values are submittable.
 *
 * Every rule here is enforced again by the API — this copy exists so the owner
 * reads it before the round trip, and its messages deliberately echo the ones
 * the service sends back.
 */
export function issueFormError(values: IssueFormValues): string | null {
  if (values.projectKey.trim() === "") {
    return "Pick the project this issue belongs to.";
  }

  const titleError = issueTitleError(values.title);
  if (titleError) {
    return titleError;
  }

  // The service refuses this too, in `create()`. Saying it here means the epic
  // toggle explains itself instead of turning into a 400 after submitting.
  if (values.isEpic && values.epicId !== "") {
    return "An epic cannot belong to another epic.";
  }

  return null;
}

export interface CreateIssuePayload {
  projectKey: string;
  title: string;
  description?: string;
  stateId?: string;
  priority: number;
  isEpic: boolean;
  epicId?: string;
  labelIds?: string[];
}

/**
 * `POST /issues` treats an absent field as "use the default", so anything the
 * form left empty is omitted rather than sent as `""` — most importantly
 * `stateId`, where omitting it lets the API pick the first workflow state and
 * keeps that default in the one place that owns it.
 *
 * `priority` and `isEpic` are always sent: both are choices the form shows and
 * the owner can have made deliberately, and 0 / false are real answers.
 */
export function toCreateIssuePayload(values: IssueFormValues): CreateIssuePayload {
  const description = values.description.trim();

  return {
    projectKey: values.projectKey.trim().toUpperCase(),
    title: values.title.trim(),
    ...(description === "" ? {} : { description: values.description }),
    ...(values.stateId === "" ? {} : { stateId: values.stateId }),
    priority: values.priority,
    isEpic: values.isEpic,
    // An epic has no parent; sending one would be refused, and silently
    // dropping it here is what makes the Type toggle safe to flip mid-form.
    ...(values.epicId === "" || values.isEpic ? {} : { epicId: values.epicId }),
    ...(values.labelIds.length === 0 ? {} : { labelIds: values.labelIds }),
  };
}

/** Label selection is a set; the form holds it as an array to keep it ordered. */
export function toggleLabel(labelIds: string[], labelId: string): string[] {
  return labelIds.includes(labelId) ? labelIds.filter((id) => id !== labelId) : [...labelIds, labelId];
}
