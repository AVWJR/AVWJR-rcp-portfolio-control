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
      "@rcp/properties": path.resolve(__dirname, "packages/properties/src/index.ts"),
      "@rcp/reporting": path.resolve(__dirname, "packages/reporting/src/index.ts"),
      "@rcp/analytics": path.resolve(__dirname, "packages/analytics/src/index.ts"),
    },
  },
});
