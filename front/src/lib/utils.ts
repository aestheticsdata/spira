import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import type { ClassValue } from "clsx";

/**
 * The design is pixel-specific, so the type scale is named by its literal size
 * (`text-13`, `text-115`) in `styles/globals.css` rather than by t-shirt sizes.
 *
 * tailwind-merge has to be told about that scale. Left to its defaults it does
 * not recognise `text-13` as a font size, files it under text-*colour* instead,
 * and then drops it as a conflict the moment the same `cn()` call also receives
 * a `text-ink-*` class — which is most of them. The class vanishes from the
 * output, the element falls back to the inherited 16px, and the result is a UI
 * where some text is the right size and the rest is enormous.
 *
 * Keep this list in step with the `--text-*` tokens in globals.css.
 */
const FONT_SIZES = ["9", "10", "105", "11", "115", "12", "125", "13", "135", "14", "15", "16", "20", "22", "25", "27"];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
