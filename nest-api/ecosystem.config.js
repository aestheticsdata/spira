/**
 * PM2 config for the Spira API.
 *
 * Unlike pfa's, this file holds NO secrets: it reads them from
 * `/var/www/spira/nest-api/.env` on the server at pm2 start/reload time and
 * spreads them into `env_production`. PM2 stays the source of `process.env`,
 * which matters because PrismaService and RedisService read it in their
 * constructors — before Nest's ConfigModule has had a chance to run.
 *
 * The .env file is deployment state, not source: it is gitignored, lives only
 * on the server, and survives releases because deploy-api.sh copies it forward.
 */
const fs = require("node:fs");
const path = require("node:path");

const APP_DIR = "/var/www/spira/nest-api";

function readEnvFile(file) {
  if (!fs.existsSync(file)) {
    return {};
  }

  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "spira-nest-api",
      cwd: APP_DIR,
      script: "dist/src/main.js",
      node_args: "-r tsconfig-paths/register",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      env_production: {
        NODE_ENV: "production",
        PORT: 6700,
        ...readEnvFile(path.join(APP_DIR, ".env")),
      },
    },
  ],
};
