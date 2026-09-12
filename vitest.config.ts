import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@rcp/ledger": path.resolve(__dirname, "packages/ledger/src/index.ts"),
    },
  },
});
