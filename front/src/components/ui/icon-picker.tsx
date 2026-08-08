"use client";

import { ProjectIcon } from "@components/ui/project-icon";
import { ensureContrast, luminance } from "@lib/colors";
import { loadEmojiCatalog, loadIconCatalog, searchCatalog } from "@lib/icons/catalog";
import { cn } from "@lib/utils";
import * as Popover from "@radix-ui/react-popover";
import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

import type { CatalogEntry } from "@lib/icons/catalog";

/** The grid is fixed-pitch, so a row's offset is arithmetic rather than measurement. */
const COLUMNS = 12;
const CELL = 32;
const VIEWPORT = 272;

/** Rows kept above and below the viewport, so a fast scroll never shows a gap. */
const OVERSCAN = 3;

/**
 * The nine base colours, drawn from the app's own palette — the seeded
 * projects, the states, the default — so a workspace picked entirely from this
 * row still looks like one workspace. Ordered the way Linear orders its row:
 * neutral first, then around the wheel.
 */
const SWATCHES = ["#a6a8ae", "#7b8fd8", "#1a8cff", "#2bb0c4", "#3ecf8e", "#f5a623", "#f0836f", "#f13ec9", "#c48a83"];

const RAINBOW = "conic-gradient(from 180deg, #f13ec9, #7b8fd8, #1a8cff, #2bb0c4, #3ecf8e, #f5a623, #f0836f, #f13ec9)";

type Tab = "icons" | "emojis";

/**
 * Where the last colour change came from, in grid columns. The wave the user
 * asked for radiates from it: a cell's transition delay grows with its
 * distance to this point, sub-linearly, so the new colour washes over the
 * visible grid instead of snapping — Linear's exact behaviour.
 */
interface Wave {
  /** Column the change originated under: the clicked swatch's, roughly. */
  col: number;
  /** Forces a state change even when the same swatch is clicked twice. */
  at: number;
}

/**
 * The grid. Windowed rather than fully rendered: the icon catalogue is nearly
 * four thousand entries, and four thousand live font glyphs in the DOM is a
 * popover that takes a visible beat to open and stutters on every keystroke.
 * Only the rows in view exist; the rest is one tall spacer keeping the
 * scrollbar honest.
 *
 * Remounted whenever the list underneath changes — see the `key` at the call
 * site — which resets both the scroll position and this component's idea of it
 * in one move.
 */
function Grid({
  entries,
  value,
  onPick,
  emoji,
  active,
  setActive,
  scroller,
  tint,
  wave,
}: {
  entries: CatalogEntry[];
  value: string;
  onPick: (key: string) => void;
  emoji: boolean;
  active: number;
  setActive: (index: number) => void;
  scroller: React.RefObject<HTMLDivElement | null>;
  /** What the glyphs are drawn in — the project colour, already legible. */
  tint: string | null;
  wave: Wave | null;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const rows = Math.ceil(entries.length / COLUMNS);

  const first = Math.max(0, Math.floor(scrollTop / CELL) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((scrollTop + VIEWPORT) / CELL) + OVERSCAN);

  /**
   * The wave. `transition-delay` per cell, set in the same style update as the
   * new colour, so the browser stages the change for us: distance^0.7 keeps it
   * a wave rather than a diagonal sweep, and measuring rows from the viewport
   * top means a scrolled grid still ripples from where the click happened.
   */
  const delay = (index: number): number => {
    if (wave === null) {
      return 0;
    }
    const dx = (index % COLUMNS) - wave.col;
    const dy = Math.floor(index / COLUMNS) - scrollTop / CELL + 1.5;
    return Math.min(40 * (dx * dx + dy * dy) ** 0.35, 450);
  };

  return (
    <div
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="sp-scroll overflow-x-hidden overflow-y-auto overscroll-contain"
      style={{ height: VIEWPORT }}
    >
      <div
        className="relative"
        style={{ height: rows * CELL }}
      >
        <div
          className="absolute inset-x-0 grid"
          style={{ top: first * CELL, gridTemplateColumns: `repeat(${COLUMNS}, ${CELL}px)` }}
        >
          {entries.slice(first * COLUMNS, last * COLUMNS).map((entry, offset) => {
            const index = first * COLUMNS + offset;
            const chosen = entry.key === value;

            return (
              <button
                key={entry.key}
                type="button"
                // The character alone announces nothing, and a ligature name
                // read out as one word announces very little.
                aria-label={entry.label}
                title={entry.label}
                aria-pressed={chosen}
                onClick={() => onPick(entry.key)}
                onMouseMove={() => setActive(index)}
                className={cn(
                  "grid place-items-center rounded-md",
                  emoji && "text-ink-4",
                  index === active && "bg-surface-hover",
                  chosen && "bg-surface-active ring-1 ring-line-focus",
                )}
                style={{ height: CELL, width: CELL }}
              >
                {emoji ? (
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{entry.key}</span>
                ) : (
                  <span
                    className="ms"
                    style={{
                      fontSize: 18,
                      color: tint ?? "var(--ink-4)",
                      transition: wave ? "color 200ms cubic-bezier(.3,.7,.4,1)" : undefined,
                      transitionDelay: wave ? `${delay(index)}ms` : undefined,
                    }}
                  >
                    {entry.key}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Picking the icon — and the colour — of a project or a saved view (COS-458),
 * modelled on Linear's popup frame for frame: base colours on top, a rainbow
 * dot that unfolds the custom picker in place, every glyph drawn in the chosen
 * colour, and the colour washing over the grid as a wave when it changes.
 *
 * The trigger is the icon itself. Clicking the thing you want to change is how
 * Linear does it, and it saves the form a second control.
 */
export function IconPicker({
  id,
  value,
  onChange,
  color,
  onColorChange,
  fallback = "folder",
  label = "Choose an icon",
  size = 18,
  glyph = 16,
  className,
}: {
  /** So a form label can point at the trigger. */
  id?: string;
  /** The stored value: a ligature name, a single emoji, or "" for none. */
  value: string;
  onChange: (icon: string) => void;
  /** The project colour. Tints the trigger, the grid, and the swatch row. */
  color?: string | null;
  /**
   * Makes the picker a colour picker too. Absent — as for saved views, which
   * have no colour column — the whole colour row disappears.
   */
  onColorChange?: (color: string) => void;
  /** Drawn when nothing is chosen — whatever the lists fall back to. */
  fallback?: string;
  label?: string;
  /** The preview's box and glyph, for the places that draw it larger than a field. */
  size?: number;
  glyph?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("icons");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [icons, setIcons] = useState<CatalogEntry[] | null>(null);
  const [emojis, setEmojis] = useState<CatalogEntry[] | null>(null);
  const [custom, setCustom] = useState(false);
  /** The hex as picked in the custom panel, before the contrast nudge. */
  const [draft, setDraft] = useState("");
  const [wave, setWave] = useState<Wave | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // Both catalogues are code-split, so this is where the download happens: on
  // first open, never on page load. `load*` caches its own promise, so opening
  // the picker a second time costs nothing.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (tab === "icons") {
      void loadIconCatalog().then(setIcons);
    } else {
      void loadEmojiCatalog().then(setEmojis);
    }
  }, [open, tab]);

  const catalog = tab === "icons" ? icons : emojis;
  const results = useMemo(() => (catalog ? searchCatalog(catalog, query) : []), [catalog, query]);

  // A highlight left over from the list that used to be there is one keystroke
  // away from choosing the wrong glyph.
  useEffect(() => {
    setActive(0);
  }, [query, tab]);

  const withColors = onColorChange !== undefined;
  const current = color ?? null;
  /** What the grid is actually drawn in — never an unreadable shade. */
  const tint = current === null ? null : ensureContrast(current);
  const adjusted = custom && draft !== "" && ensureContrast(draft).toLowerCase() !== draft.toLowerCase();

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const pickColor = (next: string, col: number) => {
    setWave({ col, at: Date.now() });
    onColorChange?.(ensureContrast(next));
  };

  /** The arrows walk the grid while the caret stays in the search field. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = STEPS[event.key];

    if (step !== undefined) {
      event.preventDefault();
      const next = Math.min(Math.max(active + step, 0), results.length - 1);
      setActive(next);

      // Scrolled by hand: the row the highlight lands on may not be rendered,
      // so there is no element to scroll into view.
      const row = Math.floor(next / COLUMNS);
      const element = scroller.current;
      if (element) {
        if (row * CELL < element.scrollTop) {
          element.scrollTop = row * CELL;
        } else if ((row + 1) * CELL > element.scrollTop + VIEWPORT) {
          element.scrollTop = (row + 1) * CELL - VIEWPORT;
        }
      }
      return;
    }

    if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      pick(results[active].key);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setCustom(false);
          setWave(null);
        }
      }}
    >
      <Popover.Trigger
        id={id}
        aria-label={label}
        className={cn(
          "grid size-8 flex-none place-items-center rounded-lg border border-line bg-field outline-none hover:border-line-hover focus-visible:border-line-focus",
          className,
        )}
      >
        <ProjectIcon
          project={{ icon: value || fallback, color: current, name: "" }}
          size={size}
          glyph={glyph}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          // Radix would otherwise focus the first tab, and this popover exists
          // to be typed into.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
          className="z-50 w-[420px] overflow-hidden rounded-lg border border-line-overlay bg-overlay shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          <Tabs.Root
            value={tab}
            onValueChange={(next) => setTab(next as Tab)}
          >
            <div className="flex items-center border-b border-line px-3">
              <Tabs.List className="flex flex-1 gap-4">
                {TABS.map(([key, title]) => (
                  <Tabs.Trigger
                    key={key}
                    value={key}
                    className={cn(
                      "relative py-2 text-125 outline-none transition-colors",
                      tab === key ? "text-ink-1" : "text-ink-6 hover:text-ink-3",
                    )}
                  >
                    {title}
                    {tab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" />}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {value !== "" && (
                <button
                  type="button"
                  onClick={() => pick("")}
                  className="py-2 text-11 text-ink-7 hover:text-ink-2"
                >
                  Clear
                </button>
              )}
            </div>

            {withColors && (
              <>
                {/* Two headers in one slot — the swatch row and the custom
                    header cross-fade in place when the rainbow dot is clicked,
                    which is the first half of Linear's transition. */}
                <div className="relative h-11">
                  <div
                    aria-hidden={custom}
                    className={cn(
                      "absolute inset-x-3 inset-y-0 flex items-center justify-between transition-all duration-200",
                      custom && "pointer-events-none -translate-y-1 opacity-0",
                    )}
                  >
                    {SWATCHES.map((swatch, index) => {
                      const selected = !custom && current !== null && swatch === current.toLowerCase();
                      return (
                        <button
                          key={swatch}
                          type="button"
                          aria-label={`Colour ${swatch}`}
                          aria-pressed={selected}
                          tabIndex={custom ? -1 : 0}
                          onClick={() => pickColor(swatch, index * 1.3)}
                          className="grid size-6 place-items-center rounded-full outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-line-focus"
                          style={{ background: swatch, transition: "transform 120ms ease-out" }}
                        >
                          {selected && (
                            <span
                              className="text-11 font-semibold"
                              style={{ color: luminance(swatch) > 0.5 ? "#26272a" : "#ffffff" }}
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <span className="h-5 w-px bg-line" />
                    <button
                      type="button"
                      aria-label="Custom colour"
                      tabIndex={custom ? -1 : 0}
                      onClick={() => {
                        setDraft(current ?? SWATCHES[1]);
                        setCustom(true);
                      }}
                      className="size-6 rounded-full outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-line-focus"
                      style={{ background: RAINBOW, transition: "transform 120ms ease-out" }}
                    />
                  </div>

                  <div
                    aria-hidden={!custom}
                    className={cn(
                      "absolute inset-x-3 inset-y-0 flex items-center gap-2.5 transition-all duration-200",
                      !custom && "pointer-events-none translate-y-1 opacity-0",
                    )}
                  >
                    <span
                      className="size-6 flex-none rounded-full"
                      style={{ background: tint ?? "var(--ink-6)" }}
                    />
                    <span className="text-11 text-ink-7">HEX</span>
                    <span className="identifier text-12 text-ink-2">{draft}</span>
                    {adjusted && <span className="ml-auto text-11 text-ink-6">Contrast has been adjusted</span>}
                    <button
                      type="button"
                      aria-label="Back to the base colours"
                      tabIndex={custom ? 0 : -1}
                      onClick={() => setCustom(false)}
                      className={cn(
                        "size-6 flex-none rounded-full outline-none ring-2 ring-ink-6",
                        !adjusted && "ml-auto",
                      )}
                      style={{ background: RAINBOW }}
                    />
                  </div>
                </div>

                {/* The second half: the custom picker unfolds beneath the
                    header, pushing the grid down, rather than appearing. */}
                <div
                  className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                  style={{ gridTemplateRows: custom ? "1fr" : "0fr", opacity: custom ? 1 : 0 }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="px-3 pb-3">
                      <HexColorPicker
                        color={draft || SWATCHES[1]}
                        onChange={(next) => {
                          setDraft(next);
                          pickColor(next, COLUMNS / 2);
                        }}
                        className="sp-colorful-panel"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="border-y border-line">
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  catalog === null
                    ? "Search…"
                    : `Search ${catalog.length.toLocaleString("en")} ${tab === "icons" ? "icons" : "emoji"}…`
                }
                spellCheck={false}
                aria-label={tab === "icons" ? "Search icons" : "Search emoji"}
                className="h-9 w-full bg-transparent px-3 text-125 text-ink-2 outline-none placeholder:text-ink-8"
              />
            </div>

            <div className="py-2 pl-3 pr-1">
              {catalog === null || results.length === 0 ? (
                <p
                  className="grid place-items-center px-4 text-center text-115 text-ink-7"
                  style={{ height: VIEWPORT }}
                >
                  {catalog === null ? "Loading…" : `Nothing matches “${query.trim()}”.`}
                </p>
              ) : (
                <Grid
                  key={`${tab} ${query}`}
                  entries={results}
                  value={value}
                  onPick={pick}
                  emoji={tab === "emojis"}
                  active={active}
                  setActive={setActive}
                  scroller={scroller}
                  tint={tint}
                  wave={wave}
                />
              )}
            </div>
          </Tabs.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const TABS: [Tab, string][] = [
  ["icons", "Icons"],
  ["emojis", "Emojis"],
];

const STEPS: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: COLUMNS,
  ArrowUp: -COLUMNS,
};
