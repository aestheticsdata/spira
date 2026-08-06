import type { StateType, WorkflowStateDto } from "@lib/api-types";

/**
 * How a workflow state is drawn. Backlog and Todo are rings, dashed vs solid —
 * colour alone cannot tell them apart, since they share `#a6a8ae`. The started
 * states are a pie, filled toward the state's own colour as work gets closer
 * to done. Done and Canceled are not a ring at all: a filled disc with a check
 * or a cross, matching Linear's own icons rather than the design file's plain
 * dot.
 */
export type StateGlyphKind = "ring" | "pie" | "check" | "cross";

export interface StateGlyph {
  kind: StateGlyphKind;
  /** Ring border style; only meaningful for "ring". */
  border: "solid" | "dashed";
  /** Pie fill fraction, 0–1; only meaningful for "pie". */
  fraction: number;
}

/**
 * The two `started` states differ — In Progress reads as roughly half done, In
 * Review as most of the way there — so `type` alone cannot pick the fraction.
 * The seeded state names disambiguate them; anything unseeded falls back to
 * the `started` type's own default.
 */
const GLYPH_BY_NAME: Record<string, Partial<StateGlyph>> = {
  "in review": { fraction: 0.85 },
};

const GLYPH_BY_TYPE: Record<StateType, StateGlyph> = {
  backlog: { kind: "ring", border: "dashed", fraction: 0 },
  unstarted: { kind: "ring", border: "solid", fraction: 0 },
  started: { kind: "pie", border: "solid", fraction: 0.5 },
  completed: { kind: "check", border: "solid", fraction: 1 },
  canceled: { kind: "cross", border: "solid", fraction: 1 },
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
