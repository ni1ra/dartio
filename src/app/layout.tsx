import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/syne";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "navi-ui/styles.css";
import "./globals.css";
// Loaded after globals so the match layout corrections win on order rather
// than on `!important`.
import "./match-layout.css";
import { SiteShell } from "@/components/site-shell";

/*
 * Fontsource keeps the faces inside the deployment. That removes both the
 * browser's third-party request and next/font's build-time Google request, which
 * otherwise made a transient font CDN failure capable of blocking a release.
 * Its bundled faces declare `font-display: swap`, so text remains readable while
 * the local asset loads instead of holding a blank scoreboard.
 */
export const metadata: Metadata = {
  title: { default: "Dartio — every dart tells a story", template: "%s · Dartio" },
  description: "Play, score, practise, and compete at darts from any screen.",
  icons: { apple: "/icons/dartio-180.png" },
};

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#090a0a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
