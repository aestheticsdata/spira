import { cn } from "@lib/utils";

/**
 * The identifier pair. The Spira identifier reads first — brighter, medium
 * weight; the legacy Linear one sits in a dashed capsule, same family but
 * smaller and dimmer, so the two can never be mistaken for each other.
 *
 * Sizes come from the design's three contexts: list row, detail header, chip.
 */
export function Identifier({
  identifier,
  legacy,
  variant = "row",
  emphasised = false,
  className,
}: {
  identifier: string;
  legacy?: string | null;
  variant?: "row" | "header" | "compact";
  emphasised?: boolean;
  className?: string;
}) {
  const live = {
    row: "text-115",
    header: "text-16",
    compact: "text-11",
  }[variant];

  const past = {
    // The list row pins the capsule to 14px so its dashed box lines up with the
    // 11.5px identifier beside it, as in the design.
    row: "text-9 px-[3px] leading-[14px]",
    header: "text-11 px-[5px] py-px",
    compact: "text-9 px-[3px]",
  }[variant];

  return (
    <span className={cn("flex items-baseline gap-1.5", className)}>
      <span
        className={cn(
          "identifier font-medium",
          live,
          variant === "header" ? "text-ink-1" : emphasised ? "text-ink-2" : "text-ink-5",
        )}
      >
        {identifier}
      </span>
      {legacy && (
        <span
          title={`Was ${legacy} in Linear`}
          className={cn("identifier rounded-[3px] border border-dashed border-line-legacy text-ink-legacy", past)}
        >
          {legacy}
        </span>
      )}
    </span>
  );
}
