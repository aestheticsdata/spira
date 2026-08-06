import { stateGlyph } from "@lib/status";
import { cn } from "@lib/utils";
import { Check, X } from "lucide-react";

import type { WorkflowStateDto } from "@lib/api-types";

/**
 * The 12px state glyph. Shape comes from the glyph table — a dashed or solid
 * ring for the not-started states, a pie filled toward the state's own colour
 * for the started ones, a filled disc with a check or a cross for done and
 * canceled — while the hue always comes from the state row itself, so
 * re-colouring a state in the database re-colours every glyph without
 * touching this component.
 */
export function StateIcon({
  state,
  size = 12,
  radius = "50%",
  className,
}: {
  state: WorkflowStateDto;
  size?: number;
  /** Every workflow state is a circle; only the synthetic "No epic" group
   *  header is a rounded square, so the caller says which. */
  radius?: string;
  className?: string;
}) {
  const glyph = stateGlyph(state);
  const common = {
    role: "img" as const,
    "aria-label": state.name,
    title: state.name,
    className: cn("grid flex-none place-items-center", className),
  };
  const box = { width: size, height: size, borderRadius: radius };

  if (glyph.kind === "check" || glyph.kind === "cross") {
    const Mark = glyph.kind === "check" ? Check : X;
    return (
      <span
        {...common}
        style={{ ...box, background: state.color }}
      >
        <Mark
          size={Math.ceil(size * 0.65)}
          strokeWidth={3}
          color="var(--canvas)"
        />
      </span>
    );
  }

  if (glyph.kind === "pie") {
    const deg = glyph.fraction * 360;
    return (
      <span
        {...common}
        style={{
          ...box,
          border: `1.5px solid ${state.color}`,
          background: `conic-gradient(${state.color} ${deg}deg, transparent ${deg}deg 360deg)`,
        }}
      />
    );
  }

  return (
    <span
      {...common}
      style={{ ...box, border: `1.5px ${glyph.border} ${state.color}` }}
    />
  );
}
