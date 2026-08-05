import { stateGlyph } from "@lib/status";
import { cn } from "@lib/utils";

import type { WorkflowStateDto } from "@lib/api-types";

/**
 * The 12px state ring. Border style, fill and dot size come from the glyph
 * table; the hue comes from the state row itself, so re-colouring a state in
 * the database re-colours every ring without touching a component.
 */
export function StateIcon({
  state,
  size = 12,
  radius = "50%",
  className,
}: {
  state: WorkflowStateDto;
  size?: number;
  /** Every workflow state is a ring; only the synthetic "No epic" group header
   *  is a rounded square, so the caller says which. */
  radius?: string;
  className?: string;
}) {
  const glyph = stateGlyph(state);

  return (
    <span
      role="img"
      aria-label={state.name}
      title={state.name}
      className={cn("grid flex-none place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: `1.5px ${glyph.border} ${state.color}`,
        background: glyph.fill,
      }}
    >
      {glyph.dot > 0 && (
        <span
          className="rounded-[1px]"
          style={{
            width: (glyph.dot * size) / 12,
            height: (glyph.dot * size) / 12,
            background: state.color,
          }}
        />
      )}
    </span>
  );
}
