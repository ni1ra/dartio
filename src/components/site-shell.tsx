"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppShell, NaviProvider, TopNav } from "navi-ui";
import { AccessProvider } from "./access-provider";
import { AccountNav } from "./account-nav";
import { ThemeMenu } from "./theme-menu";

const routes = [
  ["/play", "Play"], ["/practice", "Practice"], ["/friends", "Friends"], ["/pricing", "Pricing"],
] as const;

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"black" | "silver" | "blood">("black");

  useEffect(() => {
    const saved = window.localStorage.getItem("navi-theme");
    if (saved !== "black" && saved !== "silver" && saved !== "blood") return;
    const frame = window.requestAnimationFrame(() => setTheme(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <NaviProvider theme={theme} onThemeChange={setTheme}>
      <AccessProvider>
      <AppShell nav={<TopNav className="site-nav" brand={<Link className="brand" href="/" aria-label="Dartio home">
            <span className="brand-mark" aria-hidden="true">↗</span>
            <span>Dartio</span>
          </Link>} actions={<div className="nav-actions"><ThemeMenu /><AccountNav /><Link className="button-link" href="/play">Start a match</Link></div>}>
          <div className="desktop-links" aria-label="Primary navigation">
            {routes.map(([href, label]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</Link>)}
          </div>
        </TopNav>}>
        <div id="main-content">{children}</div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {/*
            * Every route the desktop bar carries, plus the account. Pricing used
            * to be dropped here and hidden by .desktop-links below 1100px, so
            * the page the product converts on was unreachable on a phone — the
            * device the whole design centre is built around.
            */}
          {[['/', 'Home'], ...routes, ['/account', 'You']].map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href || (href !== '/' && pathname.startsWith(href)) ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
      </AppShell>
      </AccessProvider>
    </NaviProvider>
  );
}
