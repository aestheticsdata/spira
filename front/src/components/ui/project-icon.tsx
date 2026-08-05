import { cn } from "@lib/utils";

import type { ProjectSummaryDto } from "@lib/api-types";

/**
 * A project's icon is stored as a Material Symbols ligature name (`graph_3`)
 * or as a single emoji character. Emojis are rendered as-is; anything else is
 * handed to the icon font, which draws nothing for an unknown name rather than
 * throwing — an acceptable failure mode for a decorative glyph.
 */
function isEmoji(icon: string): boolean {
  return !/^[a-z0-9_]+$/.test(icon);
}

export function ProjectIcon({
  project,
  size = 18,
  glyph,
  className,
}: {
  project: Pick<ProjectSummaryDto, "icon" | "color" | "name">;
  size?: number;
  /** Glyph size in px. The design sets it per context (18/16, 17/15, 24/20,
   *  36/28), so it is not a fixed ratio of the tile; this is the override. */
  glyph?: number;
  className?: string;
}) {
  const icon = project.icon ?? "folder";
  const glyphSize = glyph ?? Math.round(size * 0.85);

  return (
    <span
      aria-hidden
      className={cn("grid flex-none place-items-center rounded-sm", className)}
      style={{
        width: size,
        height: size,
        color: project.color ?? "var(--ink-4)",
      }}
    >
      {isEmoji(icon) ? (
        <span style={{ fontSize: glyphSize, lineHeight: 1 }}>{icon}</span>
      ) : (
        <span
          className="ms"
          style={{ fontSize: glyphSize }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}
