"use client";

import { SearchDialog } from "@components/shell/search-dialog";
import { useEffect, useState } from "react";

export function SearchTrigger() {
  const [open, setOpen] = useState(false);

  // `/` opens search, the way it does in Linear — unless the user is already
  // typing somewhere, where a slash is just a slash.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 flex h-[30px] items-center gap-2 rounded-md border border-line bg-field-alt px-2 text-left hover:border-line-hover"
      >
        <span className="size-[9px] rounded-full border-[1.5px] border-ink-7" />
        <span className="flex-1 text-125 text-ink-6">Search issues</span>
        <span className="identifier rounded-[3px] bg-surface-active px-1 py-px text-10 text-ink-8">/</span>
      </button>
      <SearchDialog
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
