import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Sans } from "next/font/google";
import { RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";
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
  description: "OpCo accounting and portfolio control — Phase B operating package",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body className={`${display.variable} ${sans.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
