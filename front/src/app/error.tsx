"use client";

import { Button } from "@components/ui/button";

/**
 * Next replaces a server error's message with a generic one in production and
 * keeps only the digest, so both are shown: whichever survives is the thread to
 * pull on. Expired sessions never land here — the request layer redirects them.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <p className="text-15 text-ink-2">Something broke on the way to that screen.</p>
      {error.message && <p className="max-w-[420px] text-125 text-ink-7">{error.message}</p>}
      {error.digest && <p className="identifier text-11 text-ink-8">{error.digest}</p>}
      <Button
        variant="secondary"
        size="sm"
        onClick={reset}
        className="mt-1"
      >
        Try again
      </Button>
    </div>
  );
}
