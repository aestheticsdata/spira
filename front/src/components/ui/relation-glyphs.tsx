import { Minus } from "lucide-react";

/**
 * "Something blocks this": a filled coral circle with a white bar, not an
 * outline. Reconstructed from a screenshot of the real app, not read from its
 * source — flagged in case it needs a follow-up pass against the exact SVG.
 */
export function BlockedGlyph({ size = 12 }: { size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center rounded-full"
      style={{ width: size, height: size, background: "var(--danger)" }}
    >
      <Minus
        size={Math.ceil(size * 0.6)}
        strokeWidth={3.5}
        color="var(--canvas)"
      />
    </span>
  );
}

/**
 * "This blocks something else": an outlined square with a small filled
 * BlockedGlyph badge at one corner, same coral. The least certain
 * reconstruction of the pair — worth checking against the real SVG.
 */
export function BlocksGlyph({ size = 12 }: { size?: number }) {
  return (
    <span
      className="relative grid flex-none place-items-center"
      style={{ width: size, height: size }}
    >
      <span
        className="rounded-[3px] border"
        style={{ width: size * 0.75, height: size * 0.75, borderColor: "var(--danger)" }}
      />
      <span
        className="absolute grid place-items-center rounded-full"
        style={{
          width: size * 0.55,
          height: size * 0.55,
          bottom: -size * 0.08,
          left: -size * 0.08,
          background: "var(--danger)",
        }}
      >
        <Minus
          size={Math.ceil(size * 0.32)}
          strokeWidth={4}
          color="var(--canvas)"
        />
      </span>
    </span>
  );
}
