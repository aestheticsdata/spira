/**
 * PM2 config for the Spira API — the template. Copy it to `ecosystem.config.js`, fill in the real
 * values, and keep that copy: it is gitignored, and `deploy-api.sh` scp's it to the server on every
 * deploy.
 *
 * This is how pfa, bkmk and zeus all do it. The values live as literals in one file on your machine,
 * never in git and never hand-edited on ks-b — the two ways a credential normally goes missing.
 *
 * PM2 stays the source of `process.env`, which matters because PrismaService and RedisService read it
 * in their constructors, before Nest's ConfigModule has had a chance to run.
 */
const config = {
  PORT: 6700,

  // mysql://spira:<password>@localhost:3306/spira
  DATABASE_URL: "",

  // 32 random bytes, base64 — `openssl rand -base64 32`
  SESSION_SECRET: "",

  REDIS_URL: "redis://localhost:6379",

  // Used for CORS.
  FRONTEND_URL: "https://spira.1991computer.com",

  // Leave unset to default to a Secure cookie in production; "false" only on a plain-HTTP host.
  // COOKIE_SECURE: "false",

  // --- Backups (COS-441) -----------------------------------------------------------------------
  // The job dumps the database twice daily and copies it to vps-debian. Absent any of these it logs
  // `DB backup skipped — missing config: <names>` and does nothing, so a typo here is silent until
  // you read the log.

  // Local dump directory on ks-b; created if absent. 14 days are kept.
  SPIRA_DUMP_PATH: "",

  // Destination directory on vps-debian. The newest 28 generations are kept.
  SPIRA_BACKUP_SERVER_PATH: "",

  // The three below are the same vps-debian box, account and key that pfa uses — take its values
  // rather than issuing a second key for the same account.
  SPIRA_BACKUP_SERVER_IP: "",
  DEBIAN_OVH_VPS_SSH_USER: "",
  DEBIAN_OVH_VPS_SSH_KEY_PATH: "",

  // --- Zeus cron reporting (COS-447) -----------------------------------------------------------
  // The backup reports its outcome to Zeus so a failure shows up on `/cron` instead of only in
  // `pm2 logs`. With the token or the app name unset the client is a silent no-op, by design — the
  // API runs identically on a laptop with no Zeus in sight.

  ZEUS_INGEST_URL: "http://127.0.0.1:6600/api/cron-runs",

  // The same value as Zeus's own ZEUS_INGEST_TOKEN — copy it from
  // /var/www/zeus/nest-api/ecosystem.config.js, do not mint a second one.
  ZEUS_INGEST_TOKEN: "",

  // Spira's slug in Zeus's port registry. It must already exist there: Zeus answers 400 to a report
  // naming an app it has never heard of, and nothing on this side surfaces that. Crons need no
  // registration — the row appears by itself on the first report.
  ZEUS_APP_NAME: "spira",

  // --- Zeus deploy reporting (COS-459) ---------------------------------------------------------
  // The odd one out: nothing in the API reads this. `deploy-api.sh` and `deploy-front.sh` run on a
  // laptop, ssh to ks-b, and `sed` the value out of this file there — so it is parked here for them
  // rather than injected into the process. It shares ZEUS_INGEST_TOKEN above, which is the point:
  // one secret per app, in the file that already holds it.
  //
  // Deploys do not self-register the way crons do. `spira · api` and `spira · front` exist on
  // Zeus's /deploys because the port registry declares them; the first report fills a row in rather
  // than creating one. Left empty, deploys still work and simply go unreported, with one line
  // saying so in the deploy output.
  ZEUS_DEPLOY_INGEST_URL: "http://127.0.0.1:6600/api/deploy-reports",
};

module.exports = {
  apps: [
    {
      name: "spira-nest-api",
      cwd: "/var/www/spira/nest-api",
      script: "dist/src/main.js",
      node_args: "-r tsconfig-paths/register",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env_production: {
        NODE_ENV: "production",
        ...config,
      },
    },
  ],
};
