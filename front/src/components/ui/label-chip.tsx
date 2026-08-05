import { cn } from "@lib/utils";

import type { LabelDto } from "@lib/api-types";

export function LabelChip({ label, className }: { label: Pick<LabelDto, "name" | "color">; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-5 flex-none items-center gap-[5px] rounded-full border border-line px-2 text-11 text-ink-4",
        className,
      )}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: label.color }}
      />
      {label.name}
    </span>
  );
}
