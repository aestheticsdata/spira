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
