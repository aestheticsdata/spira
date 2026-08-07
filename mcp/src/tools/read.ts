import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpiraClient } from "../client.js";
import type { Resolver } from "../resolve.js";
import type { IssueDetailDto, IssueListItemDto, LabelDto, ProjectDto, ProjectListItemDto } from "../types.js";

/** Every tool answers as JSON text: the caller is a model, and prose would have to be re-parsed. */
export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function registerReadTools(server: McpServer, client: SpiraClient, resolver: Resolver): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Every project in the Spira workspace, with issue counts and progress.",
      inputSchema: {
        includeArchived: z.boolean().optional().describe("Include archived projects. Defaults to false."),
      },
    },
    async ({ includeArchived }) => json(await client.get<ProjectListItemDto[]>("/projects", { includeArchived })),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get a project",
      description: "One project by its key, with description, dates and progress.",
      inputSchema: {
        key: z.string().describe('The project key, such as "SPI" or "PFA". Case-insensitive.'),
      },
    },
    async ({ key }) => json(await client.get<ProjectDto>(`/projects/${encodeURIComponent(key.toUpperCase())}`)),
  );

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "Issues, filtered. All filters combine. States and labels are given by name — " +
        "use list_issue_statuses and list_labels to see what exists. Archived issues are excluded unless asked for.",
      inputSchema: {
        project: z.string().optional().describe('Project key, such as "SPI".'),
        state: z
          .array(z.string())
          .optional()
          .describe('State names, such as ["In Progress", "Todo"]. Any of them matches.'),
        label: z.array(z.string()).optional().describe("Label names. An issue matching any of them is kept."),
        epic: z
          .string()
          .optional()
          .describe("Identifier of an epic; returns its children. Accepts a legacy COS- identifier."),
        query: z
          .string()
          .optional()
          .describe("Free text over title, description and both identifiers. Combines with the other filters."),
        priority: z.array(z.number().int().min(0).max(4)).optional().describe("0 none, 1 urgent … 4 low."),
        isEpic: z.boolean().optional().describe("Keep only epics, or only non-epics."),
        hasEpic: z.boolean().optional().describe("Keep only issues that sit in some epic, or in none."),
        includeArchived: z.boolean().optional(),
        orderBy: z.enum(["manual", "created", "updated", "priority", "title"]).optional(),
      },
    },
    async (args) => {
      const [stateIds, labelIds] = await Promise.all([
        args.state?.length ? resolver.resolveStateIds(args.state) : undefined,
        args.label?.length ? resolver.resolveLabelIds(args.label) : undefined,
      ]);

      return json(
        await client.get<IssueListItemDto[]>("/issues", {
          project: args.project?.toUpperCase(),
          state: stateIds,
          label: labelIds,
          epic: args.epic?.toUpperCase(),
          // `query` on the tool, `q` on the wire — the tool name reads better and the API's is terser.
          q: args.query,
          priority: args.priority,
          isEpic: args.isEpic,
          hasEpic: args.hasEpic,
          includeArchived: args.includeArchived,
          orderBy: args.orderBy,
        }),
      );
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get an issue",
      description:
        "One issue in full, with description, labels, epic and relations. Accepts either identifier " +
        "form, so a legacy COS- reference picked out of an old commit message works directly.",
      inputSchema: {
        identifier: z.string().describe('Live or legacy identifier, such as "SPI-24" or "COS-284".'),
      },
    },
    async ({ identifier }) =>
      json(await client.get<IssueDetailDto>(`/issues/${encodeURIComponent(identifier.trim().toUpperCase())}`)),
  );

  server.registerTool(
    "list_labels",
    {
      title: "List labels",
      description: "Every label, with how many issues carry it. These are the names list_issues accepts.",
      inputSchema: {},
    },
    async () => json(await client.get<LabelDto[]>("/labels")),
  );

  server.registerTool(
    "list_issue_statuses",
    {
      title: "List issue statuses",
      description:
        "The workflow states, in board order. These are the names list_issues and save_issue accept. " +
        "The `type` says what a state means: backlog, unstarted, started, completed or canceled.",
      inputSchema: {},
    },
    async () => json(await resolver.allStates()),
  );
}
