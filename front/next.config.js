// Server-side and rewrite target. In production PM2 sets this to the loopback
// address; nginx never lets /api reach Next anyway, so the rewrite below is a
// dev convenience and a standalone-run safety net rather than a prod path.
const apiUrl = process.env.SPIRA_API_URL || "http://127.0.0.1:6700";

const cspDirectives = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "script-src": [
    "'self'",
    // Next runtime injects an inline bootstrap script unless CSP nonces are used.
    "'unsafe-inline'",
    ...(process.env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : []),
  ],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  // Deliberately just 'self', in every environment. The browser only ever calls
  // /api on its own origin — see the rewrite below — so there is no cross-origin
  // host to allow, and no reason to widen this for development. Widening it was
  // what made a production build unusable locally: `pnpm start` sets
  // NODE_ENV=production, the dev exception dropped out, and every call to the
  // API on its own port was blocked as a CSP violation.
  "connect-src": ["'self'", ...(process.env.NODE_ENV !== "production" ? ["ws:", "wss:"] : [])],
  "frame-src": ["'none'"],
  "worker-src": ["'self'", "blob:"],
};

const contentSecurityPolicy = Object.entries(cspDirectives)
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  trailingSlash: true,
  // `trailingSlash` otherwise applies to the /api rewrite as well, and a 308 on
  // `POST /api/users/login` sends the browser to `/api/users/login/` before Nest
  // ever sees it — the login silently fails and no session cookie comes back.
  // Turning the automatic redirect off keeps pages working at either spelling
  // (links are still generated with the slash) and leaves /api alone.
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: __dirname,
  },
  // Makes the browser's view of the app identical in dev and prod: one origin,
  // with /api on it. In production nginx claims /api before Next sees it; here
  // Next forwards it to the Nest process. Same-origin also means the session
  // cookie needs no CORS and no `credentials` special-casing.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
