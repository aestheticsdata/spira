import { format } from "date-fns";

/**
 * With more than one date shown side by side, two bare `Aug 5`s have nothing
 * to tell them apart, so each carries its meaning in the title and the
 * accessible name.
 */
export function DateLabel({ iso, label }: { iso: string; label: string }) {
  const shown = format(new Date(iso), "MMM d");

  return (
    <span
      title={`${label} ${shown}`}
      className="identifier w-11 flex-none text-right text-105 text-ink-7"
    >
      {shown}
    </span>
  );
}
