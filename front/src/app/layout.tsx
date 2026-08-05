import "@styles/globals.css";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import type { Metadata } from "next";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

// Every identifier is mono — `SPI-24`, `COS-177`, keys, counts, endpoints.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spira",
  description: "Self-hosted ticketing",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Project icons are Material Symbols ligature names stored in the
            database (`graph_3`, `euro`). next/font cannot self-host an icon
            font whose glyph set is chosen at runtime, so this one stays a link. */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,1,0&display=swap"
          rel="stylesheet"
        />
        <meta
          name="theme-color"
          content="#14161b"
        />
      </head>
      <body className="bg-canvas text-ink-2 antialiased">{children}</body>
    </html>
  );
}
