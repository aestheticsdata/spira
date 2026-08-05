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
  // Reads are served by Server Components, so React Query only backs mutations
  // and the few client-side reads (search). Errors surface through error.tsx;
  // expired sessions never get here — the 401 redirects at the request layer.
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
