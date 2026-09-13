import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@rcp/ledger",
    "@rcp/entities",
    "@rcp/properties",
    "@rcp/debt",
    "@rcp/analytics",
    "@rcp/reporting",
    "@rcp/tax-bridge",
    "@rcp/documents",
    "@rcp/rcp-brand",
  ],
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
    "pdfkit",
    "pptxgenjs",
  ],
};

export default nextConfig;
