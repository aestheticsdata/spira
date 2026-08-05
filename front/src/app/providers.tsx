"use client";

import { AuthProvider } from "@auth/context/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState } from "react";
import { Toaster } from "sonner";

import type { AuthenticatedUserDto } from "@lib/api-types";

export default function Providers({
  initialUser,
  children,
}: {
  initialUser: AuthenticatedUserDto | null;
  children: React.ReactNode;
}) {
  // Reads are served by Server Components, so React Query backs only the few
  // that have to happen in the browser: the search dialog, the markdown
  // reference chip, the relation picker and the new-issue dialog's option
  // lists.
  //
  // Writes deliberately do not go through it. There is no `useMutation` in the
  // app: a mutation here would invalidate a cache the Server Components never
  // read, so every write calls the API and then `router.refresh()`, which
  // re-renders the list on the side that actually owns it. Nothing is held
  // optimistically — a status that flips back after a failed request is worse
  // than one that takes a moment to move.
  //
  // Errors surface through error.tsx; expired sessions never get here — the
  // 401 redirects at the request layer.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30 * 1000,
            throwOnError: true,
          },
        },
      }),
  );

  return (
    <AuthProvider initialUser={initialUser}>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </NuqsAdapter>
      <Toaster
        theme="dark"
        position="top-right"
        closeButton
      />
    </AuthProvider>
  );
}
