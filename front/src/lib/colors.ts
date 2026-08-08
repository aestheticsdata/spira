/**
 * The colour arithmetic behind the pickers (COS-458): WCAG contrast against
 * the app's dark canvas, and Linear's "contrast has been adjusted" nudge.
 */

/** The surface every project colour is eventually drawn on. */
export const CANVAS = "#26272a";

/** Below this a glyph stops being legible against the canvas — WCAG's floor for a graphic. */
export const MIN_CONTRAST = 3;

const HEX = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function linear(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/* HSL round-trip, for nudging lightness while keeping the hue. */

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === red) {
    h = (green - blue) / d + (green < blue ? 6 : 0);
  } else if (max === green) {
    h = (blue - red) / d + 2;
  } else {
    h = (red - green) / d + 4;
  }
  return [h / 6, s, l];
}

function hue(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) {
    return [l * 255, l * 255, l * 255];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

/**
 * The colour, or the nearest lighter shade of it that reads against the
 * canvas — Linear's "contrast has been adjusted", copied on the owner's
 * request after seeing it in action. Hue and saturation are kept; only
 * lightness moves, and only upward, because the canvas is dark.
 *
 * Callers that store the result store the adjusted value: a colour that is
 * only legible inside the picker would be a lie everywhere else.
 */
export function ensureContrast(hex: string): string {
  if (!HEX.test(hex)) {
    return hex;
  }
  if (contrast(hex, CANVAS) >= MIN_CONTRAST) {
    return hex;
  }

  const [h, s, l] = rgbToHsl(toRgb(hex));
  let low = l;
  let high = 0.97;

  // Lightness→contrast is monotonic against a dark background, so fourteen
  // halvings land within a hair of the threshold.
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    if (contrast(toHex(hslToRgb([h, s, mid])), CANVAS) < MIN_CONTRAST) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return toHex(hslToRgb([h, s, high]));
}
