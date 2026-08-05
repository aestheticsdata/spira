import { priorityBars, priorityName } from "@lib/status";

/** Three ascending bars, lit from the shortest up as priority rises. */
export function PriorityBars({ priority }: { priority: number }) {
  const [short, mid, tall] = priorityBars(priority);

  return (
    <span
      role="img"
      aria-label={priorityName(priority)}
      title={priorityName(priority)}
      className="flex h-[10px] w-3 flex-none items-end gap-[1.5px]"
    >
      <span
        className="w-[3px] rounded-[1px] bg-glyph"
        style={{ height: 4, opacity: short }}
      />
      <span
        className="w-[3px] rounded-[1px] bg-glyph"
        style={{ height: 7, opacity: mid }}
      />
      <span
        className="w-[3px] rounded-[1px] bg-glyph"
        style={{ height: 10, opacity: tall }}
      />
    </span>
  );
}
