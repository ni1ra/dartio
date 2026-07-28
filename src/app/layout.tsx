import type { Metadata } from "next";
import { DM_Mono, Manrope, Syne } from "next/font/google";
import "navi-ui/styles.css";
import "./globals.css";
// Loaded after globals so the match layout corrections win on order rather
// than on `!important`.
import "./match-layout.css";
import { SiteShell } from "@/components/site-shell";

/*
 * Self-hosted through next/font rather than an `@import` of fonts.googleapis.com
 * in globals.css. That import blocked first paint on a third-party stylesheet
 * and then a third-party font file, on a product that promises twelve seconds
 * from page load to first dart on a phone. `display: swap` keeps text readable
 * while the face loads instead of holding a blank scoreboard.
 */
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" });
const display = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Dartio — every dart tells a story", template: "%s · Dartio" },
  description: "Play, score, practise, and compete at darts from any screen.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
