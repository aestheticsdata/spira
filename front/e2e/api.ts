import { expect } from "@playwright/test";

import type { IssueDetailDto, LabelDto, WorkflowStateDto } from "@lib/api-types";
import type { Page } from "@playwright/test";

/**
 * Talking to the API with the session Playwright already holds.
 *
 * Specs use this for setup and teardown, never for the thing under test: a
 * fixture issue is faster and steadier to create with one request than by
 * driving the form that another spec already covers, and archiving on the way
 * out is the only way to leave the dev database as the run found it.
 *
 * `page.request` shares the browser context's cookies, so the session is the
 * signed-in one. CSRF is not, and has to be fetched the way the browser does.
 */
async function csrfToken(page: Page): Promise<string> {
  const response = await page.request.get("/api/users/csrf");
  const { csrfToken: token } = (await response.json()) as { csrfToken: string };
  return token;
}

export interface CreateIssueBody {
  projectKey: string;
  title: string;
  description?: string;
  stateId?: string;
  priority?: number;
  isEpic?: boolean;
  epicId?: string;
  labelIds?: string[];
}

export async function createIssue(page: Page, body: CreateIssueBody): Promise<IssueDetailDto> {
  const response = await page.request.post("/api/issues", {
    headers: { "x-csrf-token": await csrfToken(page) },
    data: body,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as IssueDetailDto;
}

export async function archiveIssue(page: Page, identifier: string): Promise<void> {
  const response = await page.request.delete(`/api/issues/${identifier}`, {
    headers: { "x-csrf-token": await csrfToken(page) },
  });
  expect(response.ok()).toBeTruthy();
}

export async function fetchStates(page: Page): Promise<WorkflowStateDto[]> {
  const response = await page.request.get("/api/states");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as WorkflowStateDto[];
}

/**
 * A label of this run's own, rather than whichever the seed happens to hold: a
 * filter spec that asserts on a label it did not create is a spec that passes
 * or fails on the state of the dev database.
 */
export async function createLabel(page: Page, name: string, color = "#7c3aed"): Promise<LabelDto> {
  const response = await page.request.post("/api/labels", {
    headers: { "x-csrf-token": await csrfToken(page) },
    data: { name, color },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as LabelDto;
}

export async function deleteLabel(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(`/api/labels/${id}`, {
    headers: { "x-csrf-token": await csrfToken(page) },
  });
  expect(response.ok()).toBeTruthy();
}
