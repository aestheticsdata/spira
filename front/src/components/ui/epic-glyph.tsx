import { cn } from "@lib/utils";

/**
 * The container glyph that marks an epic. Linear leaves an epic looking like
 * any other row; the design breaks that with three signals at once — this
 * glyph, an accent rail down the left of the row, and a heavier title.
 */
export function EpicGlyph({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Epic"
      title="Epic"
      className={cn("grid flex-none place-items-center rounded-[3px] border-[1.5px] border-ink-link", className)}
      style={{ width: size, height: size }}
    >
      <span className="block h-[1.5px] w-[5px] bg-ink-link" />
    </span>
  );
}
