/**
 * Reading the target workspace, and writing the plan into it.
 *
 * Lifted out of `scripts/import-linear.ts` when Settings grew a button for the
 * same import (COS-455). Plain functions over a `PrismaClient` rather than a
 * Nest provider, because the CLI runs outside Nest with a client of its own and
 * the two must not end up with two implementations of the one irreversible
 * operation in this codebase.
 *
 * Everything here is owner-scoped (COS-457): `ownerId` is the account being
 * imported into, and no read or write leaves it.
 */

import { randomUUID } from "node:crypto";
import { labelColourFor } from "@migration/linear-vocabulary";
import { writeOrder } from "@migration/linear-plan.util";

import type { PrismaClient } from "../../generated/prisma/client";
import type { ExistingWorkspace, ImportPlan } from "@migration/linear-plan.util";
import type { SideFile } from "@migration/linear-side-file.util";

/** Long enough for a few thousand rows; the whole import is one transaction. */
const TRANSACTION_TIMEOUT_MS = 300_000;
const TRANSACTION_MAX_WAIT_MS = 30_000;

/** What actually landed, for the report the caller prints or renders. */
export interface WriteResult {
  issues: number;
  projects: number;
  labels: number;
  relations: number;
  comments: number;
}

export async function readExisting(prisma: PrismaClient, ownerId: string): Promise<ExistingWorkspace> {
  const [issues, projects] = await Promise.all([
    prisma.issue.findMany({ where: { ownerId }, select: { identifier: true, legacyIdentifier: true } }),
    prisma.project.findMany({ where: { ownerId }, select: { key: true, issueCounter: true } }),
  ]);

  return {
    identifiers: new Set(issues.map((issue) => issue.identifier)),
    legacyIdentifiers: new Set(
      issues.map((issue) => issue.legacyIdentifier).filter((value): value is string => value !== null),
    ),
    counters: new Map(projects.map((project) => [project.key, project.issueCounter])),
  };
}

export async function writeImport(
  prisma: PrismaClient,
  ownerId: string,
  plan: ImportPlan,
  side: SideFile | null,
): Promise<WriteResult> {
  const states = await prisma.workflowState.findMany({ select: { id: true, name: true } });
  const stateIds = new Map(states.map((state) => [state.name, state.id]));

  const missingStates = [...new Set(plan.issues.map((issue) => issue.state))].filter((name) => !stateIds.has(name));
  if (missingStates.length > 0) {
    throw new Error(
      `The workspace has no state named ${missingStates.join(", ")}. Run \`pnpm seed\` first — ` +
        `the importer maps onto the seeded six, it does not create them.`,
    );
  }

  let relationsWritten = 0;
  let commentsWritten = 0;

  await prisma.$transaction(
    async (tx) => {
      // --- projects: matched on key, never overwritten ---------------------
      // An existing project's name, icon and colour are the workspace's own and
      // outrank the export's. Only a key with nothing behind it is created.
      const projectIds = new Map<string, string>();
      const lastPosition = await tx.project.aggregate({ where: { ownerId }, _max: { position: true } });
      let position = (lastPosition._max.position ?? -1) + 1;
      const backlogId = stateIds.get("Backlog") as string;

      for (const project of plan.report.byProject) {
        const existing = await tx.project.findUnique({
          where: { ownerId_key: { ownerId, key: project.key } },
          select: { id: true },
        });
        if (existing) {
          projectIds.set(project.key, existing.id);
          continue;
        }
        const created = await tx.project.create({
          data: {
            id: randomUUID(),
            ownerId,
            key: project.key,
            name: project.name.slice(0, 120),
            statusId: backlogId,
            position: position++,
          },
          select: { id: true },
        });
        projectIds.set(project.key, created.id);
      }

      // --- labels: created on the fly, preserving names --------------------
      const labelIds = new Map<string, string>();
      for (const label of plan.report.labels) {
        const row = await tx.label.upsert({
          where: { ownerId_name: { ownerId, name: label.name } },
          update: {},
          create: { id: randomUUID(), ownerId, name: label.name, color: labelColourFor(label.name) },
          select: { id: true },
        });
        labelIds.set(label.name, row.id);
      }

      // --- issues ----------------------------------------------------------
      const issueIds = new Map<string, string>();
      for (const issue of plan.issues) {
        issueIds.set(issue.legacyIdentifier, randomUUID());
      }

      // Epics first — see `writeOrder`. Writing `epicId` in a second pass
      // instead would restamp every child's `updatedAt`, which is `@updatedAt`.
      await tx.issue.createMany({
        data: writeOrder(plan.issues).map((issue) => ({
          id: issueIds.get(issue.legacyIdentifier) as string,
          ownerId,
          projectId: projectIds.get(issue.projectKey) as string,
          number: issue.number,
          identifier: issue.identifier,
          legacyIdentifier: issue.legacyIdentifier,
          title: issue.title.slice(0, 255),
          description: issue.description,
          stateId: stateIds.get(issue.state) as string,
          priority: issue.priority,
          isEpic: issue.isEpic,
          epicId: issue.epicOf === null ? null : (issueIds.get(issue.epicOf) ?? null),
          sortOrder: issue.sortOrder,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          completedAt: issue.completedAt,
          canceledAt: issue.canceledAt,
          archivedAt: issue.archivedAt,
        })),
      });

      const pairs = plan.issues.flatMap((issue) =>
        issue.labels.map((label) => ({
          issueId: issueIds.get(issue.legacyIdentifier) as string,
          labelId: labelIds.get(label) as string,
        })),
      );
      await tx.issueLabel.createMany({ data: pairs, skipDuplicates: true });

      // --- counters --------------------------------------------------------
      // Never lowered: `Math.max` guards the case of importing into a project
      // that already handed out a higher number than anything in this export.
      for (const project of plan.report.byProject) {
        const highest = plan.issues
          .filter((issue) => issue.projectKey === project.key)
          .reduce((max, issue) => Math.max(max, issue.number), 0);
        const current = await tx.project.findUnique({
          where: { ownerId_key: { ownerId, key: project.key } },
          select: { issueCounter: true },
        });
        await tx.project.update({
          where: { ownerId_key: { ownerId, key: project.key } },
          data: { issueCounter: Math.max(current?.issueCounter ?? 0, highest) },
        });
      }

      // --- the side-file, if one was taken ---------------------------------
      if (side) {
        const relations = side.relations
          .map((relation) => {
            let fromIssueId = issueIds.get(relation.from);
            let toIssueId = issueIds.get(relation.to);
            if (!fromIssueId || !toIssueId || fromIssueId === toIssueId) return null;
            // `related` is symmetric — normalised on the lower id, as the API does.
            if (relation.type === "related" && fromIssueId > toIssueId) {
              [fromIssueId, toIssueId] = [toIssueId, fromIssueId];
            }
            return { id: randomUUID(), fromIssueId, toIssueId, type: relation.type };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        await tx.issueRelation.createMany({ data: relations, skipDuplicates: true });

        const comments = side.comments
          .map((comment) => {
            const issueId = issueIds.get(comment.issue);
            if (!issueId) return null;
            // `Comment.createdAt` and `updatedAt` are both non-nullable, so an
            // unreadable one has to become *something*. Every branch is guarded
            // rather than only the first: an `Invalid Date` reaching Prisma is
            // a thrown transaction at the end of a long import.
            const usable = (value: string | undefined, fallback: Date): Date => {
              if (value === undefined) return fallback;
              const parsed = new Date(value);
              return Number.isNaN(parsed.getTime()) ? fallback : parsed;
            };
            const createdAt = usable(comment.createdAt, new Date());
            return {
              id: randomUUID(),
              issueId,
              parentId: null,
              body: comment.body,
              authorName: (comment.author ?? "cosmokaat").slice(0, 80),
              createdAt,
              updatedAt: usable(comment.updatedAt, createdAt),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        await tx.comment.createMany({ data: comments, skipDuplicates: true });

        relationsWritten = relations.length;
        commentsWritten = comments.length;
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
  );

  return {
    issues: plan.issues.length,
    projects: plan.report.byProject.length,
    labels: plan.report.labels.length,
    relations: relationsWritten,
    comments: commentsWritten,
  };
}
