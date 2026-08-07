# spira-mcp

Spira's MCP server (COS-286). Lets Claude Code read and write Spira tickets the way it works with
Linear's MCP server today — which is the point: cutting over without this would mean losing that
workflow entirely.

## How it is wired

stdio, launched by the client, calling Spira's REST API over HTTPS with an API token.

```
Claude Code  ──stdio──▶  spira-mcp  ──HTTPS + Bearer──▶  spira.1991computer.com/api
```

Nothing new runs on ks-b. The API is already there, and a second listening process would be one more
thing to deploy, secure and keep alive for nothing — the connector runs on the machine that wants it.

It is also **not** a database client, deliberately. Every invariant Spira enforces — epic rules,
identifier allocation, label validity, relation normalisation — lives behind the REST routes, so a
connector that went around them could write states the UI would refuse to produce.

## Setup

Build it, issue a token in Spira under **Settings → API tokens**, then register it:

```bash
pnpm install && pnpm build
```

```bash
claude mcp add spira --env SPIRA_API_TOKEN=spira_pat_… -- node /Users/cosmokaat/dev/spira/mcp/dist/index.js
```

`SPIRA_API_URL` overrides the API base, which is only needed to point at dev
(`http://localhost:6700/api`). It defaults to production.

## Tools

Names mirror Linear's MCP server, so existing habits and phrasing carry over unchanged.

| Tool | Notes |
|---|---|
| `list_projects` | Every project, with counts and progress |
| `get_project` | One project by key |
| `list_issues` | Filters: project, state, label, epic, query, priority, isEpic, hasEpic. All combine |
| `get_issue` | Full issue: description, labels, epic, relations |
| `save_issue` | Creates when `identifier` is omitted, updates when given |
| `list_labels` | The names `list_issues` and `save_issue` accept |
| `list_issue_statuses` | The workflow states, in board order |

**States and labels are given by name**, not UUID — `state: ["In Progress"]`, not
`state: ["3f2a…"]`. Nobody asks for issues in `3f2a…`. A name that matches nothing comes back
naming the valid set, so the mistake is correctable rather than a dead end.

**Either identifier form works** everywhere one is taken. `get_issue({ identifier: "COS-284" })`
resolves the legacy Linear identifier to the issue it became, so a reference picked out of a
five-year-old commit message works directly.

**Descriptions are raw markdown** and pass through unescaped, in both directions.

### save_issue

`labels` replaces the issue's whole label set. `epic` takes an identifier and `null` removes the
issue from its epic — which is not the same as omitting the field. Relations are **added**; there is
no removal, because removing one is a deliberate act better done where you can see the graph.

No single endpoint covers all of that: the body goes to `POST`/`PATCH /issues` and each relation is
its own `POST /issues/:identifier/relations`. The composition lives here rather than in the API
because the API's shape is right for the UI — the properties panel edits the body, the relations rail
edits relations — and it is the connector, not the server, that wants one call.

## Errors

Tool errors carry the API's own message rather than a generic failure: `Issue ZZZ-9999 not found`,
or the joined list of validation messages when a body is rejected. An unreachable API says so, and
says where it tried.
