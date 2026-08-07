"use client";

import { ROUTES } from "@components/shared/config/constants";
import useRequestHelper from "@helpers/useRequestHelper";
import { displayName, initials } from "@lib/account";
import { cn } from "@lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const ITEM =
  "flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-125 text-ink-3 outline-none " +
  "data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink-1 " +
  "data-[disabled]:pointer-events-none data-[disabled]:text-ink-9";

/** Material Symbols ligature, drawn by the icon font — decorative beside its label. */
function Icon({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="ms w-[15px] flex-none text-center text-ink-7"
      style={{ fontSize: 15 }}
    >
      {name}
    </span>
  );
}

/**
 * The account row at the foot of the sidebar, and the menu it opens (COS-454).
 *
 * It replaces a bare `Settings` link, which was the only thing down here and
 * showed nothing about who was signed in — while the header carried a hardcoded
 * "1 user" pill that was true of the schema and never of the session. With
 * several accounts able to share a database (COS-457), which one you are looking
 * at stopped being obvious from the data on screen, so the shell has to say.
 *
 * A dropdown rather than the popover the filter bar uses: these are commands,
 * and Radix's menu gives them roles, roving focus and real disabled semantics,
 * none of which a popover full of buttons would have.
 */
export function UserMenu({ username }: { username: string }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const logOut = async () => {
    setSigningOut(true);
    try {
      await privateRequest<{ ok: boolean }>("/users/logout", { method: "POST" });
      // A full document load, not router.push: signing out has to leave nothing
      // of the session behind, and a client navigation would keep this React
      // tree — and the user still sitting in its auth context — alive.
      window.location.replace(ROUTES.login.path);
    } catch (error) {
      setSigningOut(false);
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  };

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none",
            "hover:bg-line-soft focus-visible:bg-line-soft",
            open && "bg-surface-active",
          )}
        >
          <span className="identifier grid size-[22px] flex-none place-items-center rounded-full bg-primary-bg text-9 text-primary-ink">
            {initials(username)}
          </span>
          <span className="min-w-0 flex-1 truncate text-125 text-ink-3">{displayName(username)}</span>
          <Icon name="unfold_more" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[220px] rounded-lg border border-line-overlay bg-overlay p-1 shadow-[0_18px_50px_rgba(0,0,0,.5)]"
        >
          <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-11 font-semibold tracking-section text-ink-8">
            SIGNED IN
          </DropdownMenu.Label>
          {/* The full address here, where the trigger shows only `cosmokaat`.
              This is the one place the credential itself is worth printing: it
              answers "which account am I in", which matters once a demo account
              and a real one differ by their domain alone. */}
          <div className="truncate px-2 pb-2 text-115 text-ink-5">{username}</div>

          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => router.push(ROUTES.settings.path)}
          >
            <Icon name="settings" />
            settings
          </DropdownMenu.Item>

          {/* Both disabled, and shown anyway: the design has them, and hiding a
              command you intend to ship reads as "Spira cannot do this" rather
              than "not yet". Changing a password works today — on the settings
              page, which is one click above. A recovery passphrase has no column
              behind it at all yet. */}
          <DropdownMenu.Item
            className={ITEM}
            disabled
          >
            <Icon name="key" />
            change password
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={ITEM}
            disabled
          >
            <Icon name="shield" />
            set recovery passphrase
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-line-overlay" />

          <DropdownMenu.Item
            className={cn(ITEM, "text-primary-ink data-[highlighted]:text-primary-ink")}
            disabled={signingOut}
            // Radix closes the menu on select and returns focus to the trigger,
            // which fights the navigation that follows. The await has to happen
            // outside that teardown, hence preventDefault and an explicit close.
            onSelect={(event) => {
              event.preventDefault();
              setOpen(false);
              void logOut();
            }}
          >
            <Icon name="logout" />
            {signingOut ? "signing out…" : "log out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
