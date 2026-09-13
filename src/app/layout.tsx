import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import { RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
import { AccessBanner } from "@/components/access-banner";
import { ExpertRoot } from "@/components/expert/expert-root";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${RCP_NAME} — ${RCP_PRODUCT}`,
  description: "OpCo accounting and portfolio control — Phase F tax bridges, vault, and scheduled packs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body className={`${display.variable} ${sans.variable} font-sans antialiased`}>
        <AccessBanner />
        {children}
        <Suspense fallback={null}>
          <ExpertRoot />
        </Suspense>
      </body>
    </html>
  );
}
