import type { SpiraClient } from "./client.js";
import type { LabelDto, WorkflowStateDto } from "./types.js";

/**
 * Turns the words a person uses into the ids the API takes.
 *
 * `GET /issues` filters states and labels by UUID, which is right for a UI that already holds them
 * and wrong for a connector: nobody asks for "issues in 3f2a…". Linear's MCP takes names, and this
 * exists so the same phrasing keeps working after the cutover.
 */

/** Case- and space-insensitive, so "in progress" and "In Progress" are the same request. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export class Resolver {
  private states: WorkflowStateDto[] | null = null;
  private labels: LabelDto[] | null = null;

  constructor(private readonly client: SpiraClient) {}

  async allStates(): Promise<WorkflowStateDto[]> {
    this.states ??= await this.client.get<WorkflowStateDto[]>("/states");
    return this.states;
  }

  async allLabels(): Promise<LabelDto[]> {
    this.labels ??= await this.client.get<LabelDto[]>("/labels");
    return this.labels;
  }

  /**
   * A name that misses forces one refetch before it is called unknown: the workspace is live, and a
   * label created a minute ago must not be unusable for the life of the process.
   */
  private async lookup<T extends { id: string; name: string }>(
    names: string[],
    load: () => Promise<T[]>,
    invalidate: () => void,
    kind: string,
  ): Promise<string[]> {
    let pool = await load();
    let resolved = match(names, pool);

    if (resolved.missing.length > 0) {
      invalidate();
      pool = await load();
      resolved = match(names, pool);
    }

    if (resolved.missing.length > 0) {
      // Naming the valid set turns a dead end into a correctable mistake.
      throw new Error(
        `Unknown ${kind}: ${resolved.missing.join(", ")}. Available: ${pool.map((entry) => entry.name).join(", ")}`,
      );
    }

    return resolved.ids;
  }

  resolveStateIds(names: string[]): Promise<string[]> {
    return this.lookup(
      names,
      () => this.allStates(),
      () => {
        this.states = null;
      },
      "state",
    );
  }

  resolveLabelIds(names: string[]): Promise<string[]> {
    return this.lookup(
      names,
      () => this.allLabels(),
      () => {
        this.labels = null;
      },
      "label",
    );
  }

  /** Labels and states can be created by other clients, so a write should not read a stale list. */
  invalidate(): void {
    this.states = null;
    this.labels = null;
  }
}

function match<T extends { id: string; name: string }>(
  names: string[],
  pool: T[],
): { ids: string[]; missing: string[] } {
  const byName = new Map(pool.map((entry) => [normalise(entry.name), entry.id]));
  const ids: string[] = [];
  const missing: string[] = [];

  for (const name of names) {
    // A UUID passed straight through is accepted: the tools document names, but an id the caller
    // already holds should not be rejected for being precise.
    if (UUID.test(name)) {
      ids.push(name);
      continue;
    }

    const id = byName.get(normalise(name));
    if (id) {
      ids.push(id);
    } else {
      missing.push(name);
    }
  }

  return { ids, missing };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
