"use client";

import { COLOR_PATTERN, DEFAULT_PROJECT_COLOR } from "@components/projects/project-form.util";
import { CANVAS, contrast, MIN_CONTRAST } from "@lib/colors";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";

/**
 * A row of colours that read well on the dark canvas, the first of which is the
 * design's own. Everything else is a hue away from something already in the
 * app — the workflow states and the seeded projects — so a workspace picked
 * entirely from this row still looks like one workspace.
 */
const PRESETS = [
  DEFAULT_PROJECT_COLOR,
  "#e8eaed",
  "#a6a8ae",
  "#c48a83",
  "#f0836f",
  "#f5a623",
  "#c9a05a",
  "#8fae97",
  "#3ecf8e",
  "#2bb0c4",
  "#38bdf8",
  "#1a8cff",
  "#a99fc0",
  "#f13ec9",
];

/**
 * The project colour (COS-458), replacing `<input type="color">` — which opens
 * the operating system's colour panel, an eyedropper and a set of system
 * swatches that have nothing to do with this app.
 */
export function ColorPicker({
  value,
  onChange,
  label = "Project colour",
}: {
  /** `#rrggbb`. Anything else falls back to the default for the preview only. */
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const valid = COLOR_PATTERN.test(value);
  const current = valid ? value : DEFAULT_PROJECT_COLOR;

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
    >
      <Popover.Trigger
        aria-label={label}
        className="size-8 flex-none rounded-lg border border-line p-1 outline-none hover:border-line-hover focus-visible:border-line-focus"
      >
        <span
          className="block size-full rounded-[4px]"
          style={{ background: current }}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[228px] rounded-lg border border-line-overlay bg-overlay p-3 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          {/* react-colorful writes lowercase `#rrggbb`, which is exactly what
              the column holds and what the form validates. */}
          <HexColorPicker
            color={current}
            onChange={onChange}
            className="sp-colorful"
          />

          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={preset}
                title={preset}
                onClick={() => onChange(preset)}
                className={cn(
                  "size-6 rounded-md border",
                  preset.toLowerCase() === current.toLowerCase() ? "border-ink-2" : "border-transparent",
                )}
                style={{ background: preset }}
              />
            ))}
          </div>

          {valid && contrast(current, CANVAS) < MIN_CONTRAST && (
            <p className="mt-2.5 text-11 text-warn-ink">Hard to read against the background.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
