import { cn } from "@lib/utils";

/**
 * Epic progress: a conic-gradient ring plus `done/total`. The ring reads at a
 * glance across a long list where a percentage would not.
 */
export function ProgressPill({ done, total, className }: { done: number; total: number; className?: string }) {
  const degrees = total > 0 ? Math.round((done / total) * 360) : 0;

  return (
    <span
      className={cn(
        "flex flex-none items-center gap-[7px] rounded-full border border-line-strong bg-pill py-0.5 pr-2 pl-[5px]",
        className,
      )}
    >
      <span
        className="size-3 rounded-full"
        style={{
          background: `conic-gradient(var(--ink-link) ${degrees}deg, var(--accent-track) 0)`,
        }}
      />
      <span className="identifier text-10 text-ink-4">
        {done}/{total}
      </span>
    </span>
  );
}

/** The flat bar used on the projects list and the project overview. */
export function ProgressBar({ value, width = 70 }: { value: number; width?: number }) {
  return (
    <span
      className="block h-1 overflow-hidden rounded-[2px] bg-line"
      style={{ width }}
    >
      <span
        className="block h-full bg-accent"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
  );
}
