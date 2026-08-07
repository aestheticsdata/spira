import { z } from "zod";
import { json } from "./read.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpiraClient } from "../client.js";
import type { Resolver } from "../resolve.js";
import type { IssueDetailDto } from "../types.js";

const RELATION_TYPES = ["blocks", "blocked_by", "related"] as const;

/**
 * Create and update in one tool, mirroring Linear's `save_issue`.
 *
 * No single endpoint covers it: the issue body goes to POST or PATCH, and each relation is its own
 * POST to `/issues/:identifier/relations`. That composition lives here rather than in the API because
 * the API's shape is right for the UI — the properties panel edits the body and the relations rail
 * edits relations, separately — and it is the connector, not the server, that wants one call.
 */
export function registerSaveTool(server: McpServer, client: SpiraClient, resolver: Resolver): void {
  server.registerTool(
    "save_issue",
    {
      title: "Create or update an issue",
      description:
        "Creates an issue when `identifier` is omitted, updates it when given. States and labels are " +
        "given by name. `labels` replaces the whole set. Relations are added, never removed — remove " +
        "them in the UI. Descriptions are raw markdown and pass through unescaped.",
      inputSchema: {
        identifier: z
          .string()
          .optional()
          .describe("Omit to create. To update, the live or legacy identifier of the issue."),
        projectKey: z.string().optional().describe("Required when creating. Ignored on update — an issue cannot move."),
        title: z.string().optional(),
        description: z.string().nullable().optional().describe("Raw markdown. Pass null to clear it."),
        state: z.string().optional().describe('State name, such as "In Progress".'),
        priority: z.number().int().min(0).max(4).optional().describe("0 none, 1 urgent … 4 low."),
        labels: z.array(z.string()).optional().describe("Label names. Replaces the issue's whole label set."),
        epic: z
          .string()
          .nullable()
          .optional()
          .describe("Identifier of the epic to file this under. Pass null to remove it from its epic."),
        isEpic: z.boolean().optional().describe("Make this issue an epic."),
        archived: z.boolean().optional().describe("Archive or restore."),
        relations: z
          .array(
            z.object({
              type: z.enum(RELATION_TYPES),
              targetIdentifier: z.string().describe("Live or legacy identifier of the other issue."),
            }),
          )
          .optional()
          .describe("Relations to add. Existing ones are left alone."),
      },
    },
    async (args) => {
      const [stateIds, labelIds] = await Promise.all([
        args.state ? resolver.resolveStateIds([args.state]) : undefined,
        args.labels ? resolver.resolveLabelIds(args.labels) : undefined,
      ]);

      // `epic` is an identifier for the caller and a UUID for the API, and null has to survive the
      // trip — it means "remove from its epic", which is not the same as omitting the field.
      let epicId: string | null | undefined;
      if (args.epic === null) {
        epicId = null;
      } else if (args.epic !== undefined) {
        const epic = await client.get<IssueDetailDto>(`/issues/${encodeURIComponent(args.epic.trim().toUpperCase())}`);
        epicId = epic.id;
      }

      const body = {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(stateIds?.[0] ? { stateId: stateIds[0] } : {}),
        ...(args.priority !== undefined ? { priority: args.priority } : {}),
        ...(labelIds ? { labelIds } : {}),
        ...(epicId !== undefined ? { epicId } : {}),
        ...(args.isEpic !== undefined ? { isEpic: args.isEpic } : {}),
        ...(args.archived !== undefined ? { archived: args.archived } : {}),
      };

      let issue: IssueDetailDto;

      if (args.identifier) {
        issue = await client.patch<IssueDetailDto>(
          `/issues/${encodeURIComponent(args.identifier.trim().toUpperCase())}`,
          body,
        );
      } else {
        if (!args.projectKey) {
          throw new Error("projectKey is required when creating an issue.");
        }
        if (!args.title) {
          throw new Error("title is required when creating an issue.");
        }
        issue = await client.post<IssueDetailDto>("/issues", {
          projectKey: args.projectKey.trim().toUpperCase(),
          title: args.title,
          ...body,
        });
      }

      // Sequential, not parallel: each POST returns the whole issue, and the last response is the one
      // returned — which is only correct if they are applied in order.
      for (const relation of args.relations ?? []) {
        issue = await client.post<IssueDetailDto>(`/issues/${encodeURIComponent(issue.identifier)}/relations`, {
          type: relation.type,
          targetIdentifier: relation.targetIdentifier.trim().toUpperCase(),
        });
      }

      // A write may have created a label or changed a state; the next read should not see the old set.
      if (labelIds) {
        resolver.invalidate();
      }

      return json(issue);
    },
  );
}
