"use client";

import { Button } from "@components/ui/button";
import useRequestHelper from "@helpers/useRequestHelper";
import { FIELD_LIMITS } from "@schemas/field-limits";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ApiTokenDto, CreatedApiTokenDto } from "@lib/api-types";

/** Matches the design's `spira_pat_••••••••••••••••••••8f2c`. */
const MASK = "•".repeat(20);

/**
 * Wall-clock relative time, and therefore only ever rendered after mount — see `lastUsed` below.
 */
function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

/**
 * What the row shows for "last used", split by whether the client has mounted.
 *
 * This component is server-rendered — it is a client component, but the settings page is a Server
 * Component that renders it into the initial HTML. Deriving text from `Date.now()` during that render
 * makes the server and the browser disagree whenever the age crosses a bucket boundary between the
 * two, and they do not even share a clock: the server's is ks-b's, the browser's is the user's, so
 * any skew between them shifts the bucket on every load rather than only near a boundary. React 19
 * treats a text mismatch as a hydration failure and throws the subtree away.
 *
 * Before mount it renders the date portion of the ISO string — pure string slicing, so no clock and
 * no locale, which means the server and the first client paint are identical by construction. The
 * relative form takes over on the next render.
 */
function lastUsed(iso: string | null, mounted: boolean): string {
  if (!iso) return "never used";
  return mounted ? relative(iso) : iso.slice(0, 10);
}

export function TokenList({ tokens }: { tokens: ApiTokenDto[] }) {
  const router = useRouter();
  const { privateRequest } = useRequestHelper();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The one and only sighting of a raw token. Held in state, never refetched.
  const [revealed, setRevealed] = useState<CreatedApiTokenDto | null>(null);
  // False through the server render and the hydrating one, so `lastUsed` stays clock-free until both
  // have agreed on the same HTML.
  const [mounted, setMounted] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (creating) nameInput.current?.focus();
  }, [creating]);

  const closeCreate = () => {
    setCreating(false);
    setName("");
    setError(null);
  };

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("A token needs a name — what it is for.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const created = await privateRequest<CreatedApiTokenDto>("/tokens", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setRevealed(created);
      closeCreate();
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The token could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (token: ApiTokenDto) => {
    setBusy(true);

    try {
      await privateRequest<ApiTokenDto>(`/tokens/${token.id}`, { method: "DELETE" });
      setConfirmId(null);
      router.refresh();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "The token could not be revoked.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Token copied.");
    } catch {
      toast.error("Could not reach the clipboard — select it and copy by hand.");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center border-b border-line bg-surface px-4 py-[13px]">
        <div className="flex-1 text-125 font-semibold text-ink-3">API tokens</div>
        <button
          type="button"
          onClick={() => (creating ? closeCreate() : setCreating(true))}
          className="text-115 text-ink-link hover:text-ink-link-hover"
        >
          {creating ? "Cancel" : "New token"}
        </button>
      </div>

      {revealed && (
        <div className="border-b border-line-soft bg-surface-hi px-4 py-3">
          <div className="mb-1.5 text-115 text-ink-5">
            Copy <span className="text-ink-3">{revealed.name}</span> now — it is hashed at rest and will not be shown
            again.
          </div>
          <div className="flex h-8 items-center gap-2.5 rounded-lg border border-line bg-field px-2.5">
            <span className="identifier min-w-0 flex-1 truncate text-115 text-ink-2">{revealed.token}</span>
            <button
              type="button"
              onClick={() => copy(revealed.token)}
              className="flex-none text-11 text-ink-link hover:text-ink-link-hover"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="flex-none text-11 text-ink-7 hover:text-ink-4"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {tokens.map((token) => {
        const revoked = token.revokedAt !== null;
        return (
          <div
            key={token.id}
            className="group flex items-center gap-2.5 border-b border-line-soft px-4 py-[11px]"
          >
            <span className={`min-w-0 flex-1 truncate text-125 ${revoked ? "text-ink-8 line-through" : "text-ink-3"}`}>
              {token.name}
            </span>
            <span className="identifier flex-none text-11 text-ink-7">
              spira_pat_{MASK}
              {token.suffix}
            </span>
            {/* Shown for revoked tokens too. The whole reason the row is kept rather than deleted is
                that its last use is the record of what had access and when — replacing it with the
                word "revoked" would throw away the one fact worth reading after revoking in a hurry.
                The struck-through name and the missing Revoke button already say it is revoked. */}
            <span className="w-[92px] flex-none text-right text-11 text-ink-7">
              {lastUsed(token.lastUsedAt, mounted)}
            </span>

            {revoked ? (
              // Nothing to do to a revoked token, and the row stays so its last use is still readable.
              <span className="w-[76px] flex-none" />
            ) : confirmId === token.id ? (
              <span className="flex w-[76px] flex-none justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevoke(token)}
                  className="text-11 text-danger disabled:opacity-50"
                >
                  Revoke
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="text-11 text-ink-7 hover:text-ink-4"
                >
                  Keep
                </button>
              </span>
            ) : (
              <span className="flex w-[76px] flex-none justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmId(token.id)}
                  className="text-11 text-ink-7 opacity-0 hover:text-ink-4 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  Revoke
                </button>
              </span>
            )}
          </div>
        );
      })}

      {tokens.length === 0 && !creating && (
        <p className="border-b border-line-soft px-4 py-[11px] text-125 text-ink-7">
          No tokens yet. One is needed before the MCP connector can reach anything.
        </p>
      )}

      {creating && (
        <form
          onSubmit={onCreate}
          className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-4 py-[11px]"
        >
          <input
            ref={nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={FIELD_LIMITS.apiTokenName}
            placeholder="What is it for — “Claude Code”"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-field px-2.5 text-125 text-ink-2 outline-none placeholder:text-ink-8 focus:border-line-focus"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={busy}
          >
            Create
          </Button>
          {error && <p className="w-full text-11 text-danger">{error}</p>}
        </form>
      )}
    </section>
  );
}
