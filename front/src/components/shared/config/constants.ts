/**
 * Every path the app links to. The short project URLs (`/spi/issues`) come from
 * the design; they work because Next resolves static segments before the
 * dynamic `[key]` one, and because a project key can never be `projects`,
 * `issue`, `settings` or `login` — the API rejects those as reserved.
 */
export const ROUTES = {
  login: { path: "/login" },
  projects: { path: "/projects" },
  projectNew: { path: "/projects/new" },
  projectIssues: { path: (key: string) => `/${key.toLowerCase()}/issues` },
  projectOverview: { path: (key: string) => `/${key.toLowerCase()}/overview` },
  projectEdit: { path: (key: string) => `/${key.toLowerCase()}/edit` },
  issue: { path: (identifier: string) => `/issue/${identifier.toUpperCase()}` },
  views: { path: "/views" },
  /** Where a saved view is opened from — see the route for what it does next. */
  view: { path: (id: string) => `/views/${id}` },
  settings: { path: "/settings" },
} as const;

/**
 * Mirrors `RESERVED_PROJECT_KEYS` in `nest-api/src/projects/project-key.util.ts`,
 * which is what actually rejects them. This copy only exists so the form can
 * say why before the request leaves the browser.
 */
export const RESERVED_PROJECT_KEYS = ["ISSUE", "LOGIN", "API", "NEW", "VIEWS"] as const;
