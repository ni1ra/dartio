import { gotoDartio } from "./navigation";
import { expect, test, type Page, type Route } from "@playwright/test";

const SURFACES = [
  ["landing", "/"],
  ["setup", "/play"],
  ["practice", "/practice"],
  ["friends", "/friends"],
  ["pricing", "/pricing"],
  ["account", "/account"],
  ["sign in", "/auth/sign-in"],
  ["sign up", "/auth/sign-up"],
  ["X01", "/play/match?start=501&level=8&best=5&out=double"],
  ["Cricket", "/play/match?mode=cricket&variant=standard&opponent=local"],
  ["Around the Clock", "/play/match?mode=aroundTheClock"],
  ["Shanghai", "/play/match?mode=shanghai"],
  ["Count-Up", "/play/match?mode=countUp"],
  ["Bob's 27", "/play/match?mode=bobs27"],
  ["Checkout Lab", "/play/match?drill=checkoutLab"],
  ["Doubles Matrix", "/play/match?drill=doublesMatrix"],
  ["Scoring Sprint", "/play/match?drill=scoringSprint"],
] as const;

const INTERACTIVE_ROLES = new Set([
  "button", "checkbox", "combobox", "link", "menuitem", "radio",
  "searchbox", "slider", "spinbutton", "switch", "tab", "textbox",
]);

const PERFORMANCE_BUDGETS = {
  landing: { totalBytes: 760_000, scriptBytes: 600_000, styleBytes: 120_000, resourceCount: 65, domNodes: 425 },
  X01: { totalBytes: 800_000, scriptBytes: 650_000, styleBytes: 120_000, resourceCount: 70, domNodes: 375 },
} as const;

const ANONYMOUS_ACCESS = {
  auth: "anonymous",
  effectivePlan: "free",
  accessState: "free",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: ["local_scoring", "basic_checkout"],
  limits: { aiMaxLevel: 8, historyMatches: 50, onlineSeats: 0 },
  availability: {
    localScoring: "implemented", advancedAi: "implemented", advancedCheckout: "implemented",
    voiceInput: "implemented", history: "implemented", deepStats: "implemented",
    onlineMultiplayer: "implemented", customPractice: "implemented", clubManagement: "coming_soon",
  },
} as const;

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

/**
 * The quality matrix must render the same signed-out paid gates locally and on
 * Preview. Otherwise a credential-free local build swaps them for its 503
 * fallback and can miss contrast or focus defects in the actual visitor UI.
 */
async function exposeAnonymousPaidGates(page: Page) {
  await page.route("**/api/auth/get-session", (route) => json(route, null));
  await page.route("**/api/access", (route) => json(route, ANONYMOUS_ACCESS));
}

/**
 * Reads the browser's computed accessibility tree, not just author attributes.
 * An aria-label that is syntactically present but cannot name the control still
 * appears empty here, exactly as it does to assistive technology.
 */
async function unnamedInteractiveNodes(page: Page): Promise<readonly string[]> {
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree") as {
    nodes: Array<{
      ignored?: boolean;
      role?: { value?: string };
      name?: { value?: string };
      backendDOMNodeId?: number;
    }>;
  };
  await session.detach();

  return tree.nodes.flatMap((node) => {
    const role = node.role?.value ?? "";
    if (node.ignored || !INTERACTIVE_ROLES.has(role) || node.name?.value?.trim()) return [];
    return [`${role}#${node.backendDOMNodeId ?? "unknown"}`];
  });
}

for (const [name, path] of SURFACES) {
  test(`${name} exposes named controls, unique ids, landmarks, and AA-size targets`, async ({ page }) => {
    if (path.startsWith("/play/match")) await exposeAnonymousPaidGates(page);
    const response = await gotoDartio(page, path);
    expect(response?.status(), `${name} did not load`).toBeLessThan(400);
    await expect(page.locator("main")).toHaveCount(1);
    // The navigation intentionally hides its placeholder while session
    // authority resolves. Auditing that transient node would measure hidden
    // loading copy rather than the player-visible signed-in/out control.
    await expect(page.locator(".account-nav--pending")).toHaveCount(0);

    expect(await unnamedInteractiveNodes(page), `${name} has unnamed interactive nodes`).toEqual([]);

    const audit = await page.evaluate(() => {
      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const duplicateIds = [...document.querySelectorAll<HTMLElement>("[id]")]
        .map((element) => element.id)
        .filter((id, index, ids) => id && ids.indexOf(id) !== index)
        .filter((id, index, ids) => ids.indexOf(id) === index);
      type Rgba = readonly [number, number, number, number];
      const parseColor = (value: string): Rgba | null => {
        const match = value.match(/^rgba?\((.+)\)$/);
        if (!match) return null;
        const channels = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
        if (channels.length < 3 || channels.slice(0, 3).some((channel) => !Number.isFinite(channel))) return null;
        return [channels[0]!, channels[1]!, channels[2]!, Number.isFinite(channels[3]) ? channels[3]! : 1];
      };
      const blend = (front: Rgba, back: Rgba): Rgba => {
        const alpha = front[3] + back[3] * (1 - front[3]);
        if (alpha === 0) return [0, 0, 0, 0];
        return [
          (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
          (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
          (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
          alpha,
        ];
      };
      const luminance = (color: Rgba) => {
        const linear = color.slice(0, 3).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      };
      const backgroundBehind = (element: Element): Rgba => {
        const chain: Element[] = [];
        for (let current: Element | null = element; current; current = current.parentElement) chain.unshift(current);
        return chain.reduce<Rgba>((background, current) => {
          const layer = parseColor(getComputedStyle(current).backgroundColor);
          return layer && layer[3] > 0 ? blend(layer, background) : background;
        }, [255, 255, 255, 1]);
      };
      const contrastIssues = [...document.querySelectorAll<HTMLElement>("body *")].flatMap((element) => {
        const directText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        if (!directText || !visible(element) || element.closest(".sr-only")
          || element.matches(":disabled,[aria-disabled='true']")
          || element.closest(":disabled,[aria-disabled='true']")) return [];
        for (let current: Element | null = element; current; current = current.parentElement) {
          if (Number.parseFloat(getComputedStyle(current).opacity) < 1) return [];
        }
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        if (!foreground) return [];
        const background = backgroundBehind(element);
        const renderedForeground = blend(foreground, background);
        const lighter = Math.max(luminance(renderedForeground), luminance(background));
        const darker = Math.min(luminance(renderedForeground), luminance(background));
        const ratio = (lighter + 0.05) / (darker + 0.05);
        const size = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10);
        const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        return ratio + 0.01 < threshold
          ? [`${element.tagName.toLowerCase()}[${directText.slice(0, 40)}] ${ratio.toFixed(2)}:${threshold}`]
          : [];
      });
      const selectors = "a[href],button,input,select,textarea,[role='button'],[role='link']";
      const keyboardDeadEnds = [...document.querySelectorAll<HTMLElement>(selectors)].flatMap((element) => {
        if (!visible(element) || element.matches(":disabled,[aria-disabled='true']")) return [];
        if (element.tabIndex >= 0) return [];
        const composite = element.closest("[role='radiogroup'],[role='tablist'],[role='menu'],[role='listbox']");
        if (composite && [...composite.querySelectorAll<HTMLElement>(selectors)]
          .some((candidate) => visible(candidate) && candidate.tabIndex >= 0)) return [];
        const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
        return [`${element.tagName.toLowerCase()}[${label.slice(0, 40)}]`];
      });
      const undersizedTargets = [...document.querySelectorAll<HTMLElement>(selectors)].flatMap((element) => {
        if (!visible(element) || element.matches(":disabled,[aria-disabled='true']")) return [];
        const style = getComputedStyle(element);
        // WCAG 2.2 exempts links whose target size is constrained by inline text.
        if (element instanceof HTMLAnchorElement && style.display === "inline") return [];
        const rect = element.getBoundingClientRect();
        if (rect.width >= 24 && rect.height >= 24) return [];
        const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
        return [`${element.tagName.toLowerCase()}[${label.slice(0, 40)}] ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`];
      });
      return { contrastIssues, duplicateIds, keyboardDeadEnds, undersizedTargets };
    });

    expect(audit.contrastIssues, `${name} has text below WCAG AA contrast`).toEqual([]);
    expect(audit.duplicateIds, `${name} repeats document ids`).toEqual([]);
    expect(audit.keyboardDeadEnds, `${name} exposes controls the keyboard cannot reach`).toEqual([]);
    expect(audit.undersizedTargets, `${name} has targets below WCAG 2.2's 24px AA floor`).toEqual([]);

    // Sample the actual tab order as a user would. Static tabindex checks catch
    // omissions; this catches focus traps, invisible destinations, sticky-header
    // occlusion, and regressions that remove the visible focus treatment.
    const focusableCount = await page.locator(
      "a[href]:visible,button:not(:disabled):visible,input:not(:disabled):visible,select:not(:disabled):visible,textarea:not(:disabled):visible,[tabindex]:not([tabindex='-1']):visible",
    ).count();
    await page.evaluate(() => {
      const selectors = "a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1'])";
      [...document.querySelectorAll<HTMLElement>(selectors)]
        .forEach((element, index) => { element.dataset.qualityFocusId = String(index); });
      (document.activeElement as HTMLElement | null)?.blur();
    });
    const visited = new Set<string>();
    for (let index = 0; index < Math.min(focusableCount, 12); index += 1) {
      await page.keyboard.press("Tab");
      await page.locator(":focus").evaluate((element) => element.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      }));
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return { key: "body", issue: "focus returned to the document" };
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const centerX = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const centerY = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        const top = document.elementFromPoint(centerX, centerY);
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
          && rect.top < innerHeight && rect.left < innerWidth;
        const indicated = (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0)
          || style.boxShadow !== "none";
        const unobscured = top !== null && (element.contains(top) || top.contains(element));
        const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
        return {
          key: `${element.dataset.qualityFocusId ?? "unknown"}:${element.tagName}:${label.slice(0, 40)}`,
          issue: !visible ? "focused control is outside the viewport"
            : !unobscured ? "focused control is obscured"
              : !indicated ? "focused control has no visible indicator"
                : null,
        };
      });
      expect(focused.issue, `${name} keyboard focus at ${focused.key}`).toBeNull();
      expect(visited.has(focused.key), `${name} trapped focus at ${focused.key}`).toBe(false);
      visited.add(focused.key);
    }
  });
}

test("reduced motion removes every running decorative animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoDartio(page, "/");

  const running = await page.evaluate(() => [...document.getAnimations()]
    .filter((animation) => animation.playState === "running" && animation.effect?.getTiming().duration !== 0)
    .map((animation) => {
      const target = (animation.effect as KeyframeEffect).target as Element | null;
      return target?.className || target?.tagName || "unknown";
    }));
  expect(running).toEqual([]);
});

for (const [name, path] of [["landing", "/"], ["X01", "/play/match?start=501&level=8&best=5&out=double"]] as const) {
  test(`${name} stays inside its measured transfer and layout budget`, async ({ page }) => {
    await gotoDartio(page, path);
    const metrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const bytes = (entries: PerformanceResourceTiming[]) => entries.reduce((sum, entry) => sum + entry.transferSize, 0);
      return {
        totalBytes: bytes(resources),
        scriptBytes: bytes(resources.filter((entry) => entry.initiatorType === "script")),
        styleBytes: bytes(resources.filter((entry) => entry.initiatorType === "css" || entry.name.endsWith(".css"))),
        resourceCount: resources.length,
        domNodes: document.getElementsByTagName("*").length,
      };
    });
    const budget = PERFORMANCE_BUDGETS[name];
    for (const key of Object.keys(budget) as Array<keyof typeof budget>) {
      expect(metrics[key], `${name} ${key} exceeded its measured budget`).toBeLessThanOrEqual(budget[key]);
    }
  });
}
