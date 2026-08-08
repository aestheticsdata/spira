/**
 * The side-file: the relations and comments the Linear CSV cannot carry.
 *
 * Lifted out of `scripts/import-linear.ts` when Settings grew a button for the
 * same import (COS-455). It takes the *text* rather than a path, because the
 * CLI has a file and the endpoint has an upload, and neither should own a copy
 * of how the thing is read.
 */

export interface SideFile {
  relations: { from: string; type: "blocks" | "related"; to: string }[];
  comments: { issue: string; body: string; author?: string; createdAt?: string; updatedAt?: string }[];
}

export const EMPTY_SIDE_FILE: SideFile = { relations: [], comments: [] };

/**
 * Read defensively rather than trustingly: this file is assembled by hand from
 * the connector at cutover, so a typo in it is likelier than a bug here, and it
 * should say which entry it choked on rather than throwing a cast error.
 *
 * Unparseable JSON is the one thing it does throw on — there is no entry to
 * name, and continuing with an empty side-file would silently drop every
 * relation and comment the operator meant to bring across.
 */
export function readSideFile(text: string): { side: SideFile; problems: string[] } {
  const problems: string[] = [];
  const side: SideFile = { relations: [], comments: [] };

  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    return { side, problems: ["the side-file is not a JSON object"] };
  }

  const raw = parsed as { relations?: unknown; comments?: unknown };

  if (Array.isArray(raw.relations)) {
    raw.relations.forEach((entry: unknown, position) => {
      const r = entry as { from?: unknown; type?: unknown; to?: unknown };
      if (typeof r.from !== "string" || typeof r.to !== "string") {
        problems.push(`relations[${position}] needs string "from" and "to"`);
        return;
      }
      if (r.type !== "blocks" && r.type !== "related") {
        problems.push(`relations[${position}] type must be "blocks" or "related", not ${JSON.stringify(r.type)}`);
        return;
      }
      side.relations.push({ from: r.from.toUpperCase(), type: r.type, to: r.to.toUpperCase() });
    });
  } else if (raw.relations !== undefined) {
    problems.push(`"relations" must be an array`);
  }

  if (Array.isArray(raw.comments)) {
    raw.comments.forEach((entry: unknown, position) => {
      const c = entry as Record<string, unknown>;
      if (typeof c.issue !== "string" || typeof c.body !== "string") {
        problems.push(`comments[${position}] needs string "issue" and "body"`);
        return;
      }
      side.comments.push({
        issue: c.issue.toUpperCase(),
        body: c.body,
        author: typeof c.author === "string" ? c.author : undefined,
        createdAt: typeof c.createdAt === "string" ? c.createdAt : undefined,
        updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : undefined,
      });
    });
  } else if (raw.comments !== undefined) {
    problems.push(`"comments" must be an array`);
  }

  return { side, problems };
}
