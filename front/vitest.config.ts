import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const abs = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the tsconfig `paths` aliases so tests import via @components/*,
    // @lib/*, … exactly like the app code does.
    alias: {
      "@styles": abs("./styles"),
      "@app": abs("./src/app"),
      "@components": abs("./src/components"),
      "@auth": abs("./src/auth"),
      "@helpers": abs("./src/helpers"),
      "@lib": abs("./src/lib"),
      "@schemas": abs("./src/schemas"),
      "@src": abs("./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
