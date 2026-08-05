/**
 * Every path the app links to. The short project URLs (`/spi/issues`) come from
 * the design; they work because Next resolves static segments before the
 * dynamic `[key]` one, and because a project key can never be `projects`,
 * `issue`, `settings` or `login` — the API rejects those as reserved.
 */
export const ROUTES = {
  login: { path: "/login" },
  projects: { path: "/projects" },
  projectIssues: { path: (key: string) => `/${key.toLowerCase()}/issues` },
  projectOverview: { path: (key: string) => `/${key.toLowerCase()}/overview` },
  issue: { path: (identifier: string) => `/issue/${identifier.toUpperCase()}` },
  settings: { path: "/settings" },
} as const;

export const RESERVED_PROJECT_KEYS = ["ISSUE", "LOGIN", "API", "NEW"] as const;
