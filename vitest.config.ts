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
      "@rcp/debt": path.resolve(__dirname, "packages/debt/src/index.ts"),
      "@rcp/documents": path.resolve(__dirname, "packages/documents/src/index.ts"),
      "@rcp/rcp-brand": path.resolve(__dirname, "packages/rcp-brand/src/index.ts"),
      "@rcp/tax-bridge": path.resolve(__dirname, "packages/tax-bridge/src/index.ts"),
    },
  },
});
