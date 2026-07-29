import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every test starts from clean spies/stubs so module-level singletons
    // (rate-limit store, resolved-model cache) are the only shared state
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
