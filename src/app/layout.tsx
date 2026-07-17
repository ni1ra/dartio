import type { Metadata } from "next";
import "navi-ui/styles.css";
import "@neondatabase/auth/ui/css";
import "./globals.css";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: { default: "Dartio — every dart tells a story", template: "%s · Dartio" },
  description: "Play, score, practise, and compete at darts from any screen.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
