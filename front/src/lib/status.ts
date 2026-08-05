import type { StateType, WorkflowStateDto } from "@lib/api-types";

/**
 * How a workflow state is drawn: a 12px ring whose border style, fill and inner
 * dot size together carry the state. Colour alone cannot — Backlog and Todo
 * share `#a6a8ae` and are told apart only by dashed vs solid.
 *
 * Values are lifted from the `ST` table in the design file.
 */
export interface StateGlyph {
  /** Ring border style. */
  border: "solid" | "dashed";
  /** Ring fill, behind the dot. */
  fill: string;
  /** Inner dot diameter in px; 0 means no dot. */
  dot: number;
}

/**
 * The two `started` states differ in the design — In Progress is a 6px amber
 * dot, In Review a 4px lilac one — so `type` alone cannot pick the glyph. The
 * seeded state names disambiguate them; anything unseeded falls back to `type`.
 */
const GLYPH_BY_NAME: Record<string, Partial<StateGlyph>> = {
  "in review": { dot: 4 },
};

const GLYPH_BY_TYPE: Record<StateType, StateGlyph> = {
  backlog: { border: "dashed", fill: "transparent", dot: 0 },
  unstarted: { border: "solid", fill: "transparent", dot: 0 },
  started: { border: "solid", fill: "transparent", dot: 6 },
  completed: { border: "solid", fill: "var(--state-completed-fill)", dot: 5 },
  canceled: { border: "solid", fill: "var(--state-canceled-fill)", dot: 5 },
};

export function stateGlyph(state: Pick<WorkflowStateDto, "name" | "type">): StateGlyph {
  return {
    ...GLYPH_BY_TYPE[state.type],
    ...GLYPH_BY_NAME[state.name.toLowerCase()],
  };
}

/** Linear's order: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const PRIORITY_NAMES = ["No priority", "Urgent", "High", "Medium", "Low"] as const;

export function priorityName(priority: number): string {
  return PRIORITY_NAMES[priority] ?? PRIORITY_NAMES[0];
}

/**
 * Opacity of the three ascending bars of the priority glyph, shortest first.
 * Reproduces the design's expression: any priority lights the short bar, medium
 * and above light the second, high and above light the third.
 */
export function priorityBars(priority: number): [number, number, number] {
  const set = 1;
  const unset = 0.3;
  return [
    priority > 0 ? set : unset,
    priority > 0 && priority <= 3 ? set : unset,
    priority > 0 && priority <= 2 ? set : unset,
  ];
}

/**
 * The order status groups appear in on the issues list. Deliberately NOT the
 * state table's own order and not derivable from `type`: the design puts Todo
 * between the two `started` states, so what you are working on and what you
 * could pick up next sit at the top, and Backlog sinks below both.
 */
export const GROUP_ORDER = ["In Progress", "Todo", "In Review", "Backlog", "Done", "Canceled"];

export function compareStatesForGrouping(a: WorkflowStateDto, b: WorkflowStateDto): number {
  const rank = (state: WorkflowStateDto) => {
    const index = GROUP_ORDER.indexOf(state.name);
    return index === -1 ? GROUP_ORDER.length + state.position : index;
  };
  return rank(a) - rank(b);
}
