import { expect, test } from "@playwright/test";

/**
 * Black, silver, and blood must each be readable.
 *
 * The failure this guards against is a theme that switches component colours but
 * leaves app-styled text at the previous theme's value — dark text on a dark
 * surface, or the reverse. Contrast is computed rather than eyeballed so the
 * check means the same thing on every run.
 */
const THEMES = ["Black", "Silver", "Blood"] as const;

/** Text that must stay legible in every theme, across the match surface. */
const TEXT_SAMPLES = [
  ".score-player span",
  ".score-player strong",
  ".match-header",
  ".checkout-heading h2",
  ".history-strip h2",
];

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: readonly number[]): number {
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(foreground: readonly number[], background: readonly number[]): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

for (const theme of THEMES) {
  test(`${theme} keeps match text legible`, async ({ page }) => {
    await page.goto("/play/match?start=501&level=8&best=5&out=double", { waitUntil: "networkidle" });
    // Themes moved from inline buttons to a single-icon menu: open the
    // trigger, then pick the theme by its menu-item role and label.
    await page.locator(".theme-menu__trigger").first().click();
    await page.getByRole("menuitemradio", { name: theme }).click();
    await page.waitForTimeout(300);

    const measured = await page.evaluate((selectors) => {
      /*
       * Colours are resolved through a 1×1 canvas rather than by parsing the
       * computed string. The app mixes `rgb()`, `color(srgb …)`, and
       * `color-mix()`, whose numeric ranges differ — reading `color(srgb …)` as
       * 0–255 makes a white panel look black and invents a contrast failure.
       */
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const toRgba = (value: string): number[] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      // Semi-transparent panels sit over the surface beneath them, so the layers
      // are composited in paint order instead of taking the first one found.
      const over = (top: number[], bottom: number[]): number[] => {
        const alpha = top[3]! / 255;
        return [0, 1, 2].map((i) => Math.round(top[i]! * alpha + bottom[i]! * (1 - alpha))).concat(255);
      };
      const backdrop = (element: Element): number[] => {
        const layers: number[][] = [];
        for (let node: Element | null = element; node; node = node.parentElement) {
          const colour = toRgba(getComputedStyle(node).backgroundColor);
          if (colour[3] === 0) continue;
          layers.push(colour);
          if (colour[3] === 255) break;
        }
        return layers.reduceRight((below, layer) => over(layer, below), [255, 255, 255, 255]);
      };
      return selectors.flatMap((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const background = backdrop(element);
        // Text can be semi-transparent too; composite it over what it sits on.
        const text = over(toRgba(getComputedStyle(element).color), background);
        return [{ selector, text, background }];
      });
    }, TEXT_SAMPLES);

    expect(measured.length, "no sampled text found on the match surface").toBeGreaterThan(0);
    for (const sample of measured) {
      // 3:1 is the large-text floor; the samples are headline and label sizes,
      // and a genuine dark-on-dark regression lands far below it.
      expect(
        contrast(sample.text, sample.background),
        `${theme}: ${sample.selector} is rgb(${sample.text}) on rgb(${sample.background})`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
}

/*
 * Lain's standing rule: never black or dark text on an orange/accent background,
 * always white, via --on-accent.
 *
 * The rule was closed in Cycle 11 on the receipt that the token exists. A token
 * existing is not proof that every accent surface uses it — the same shape of gap
 * that let "/auth/sign-in loads" stand in for "a visitor can reach it". This
 * measures what is actually painted, so a future rule that sets an accent
 * background without setting the foreground fails here rather than in his hands.
 */
const ACCENT_SURFACES = [
  ["landing call to action", "/", ".closing-cta"],
  ["start-a-match button", "/", "a.button-link"],
  ["brand mark", "/", ".brand-mark"],
] as const;

for (const [name, path, selector] of ACCENT_SURFACES) {
  test(`${name} keeps light text on the accent`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const element = page.locator(selector).first();
    await expect(element, `${name} not found at ${path}`).toBeAttached();

    const measured = await element.evaluate((node) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const toRgba = (value: string): number[] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const style = getComputedStyle(node);
      return { text: toRgba(style.color), background: toRgba(style.backgroundColor) };
    });

    // Only meaningful where the element genuinely paints the accent; a themed
    // variant that drops the accent background is not what this guards.
    const backgroundLuminance = luminance(measured.background);
    if (measured.background[3] === 0) return;

    // The rule is directional, not merely contrasty: dark-on-accent is the
    // failure, and black text on orange can still clear a naive contrast floor.
    expect(
      luminance(measured.text),
      `${name}: text rgb(${measured.text}) on rgb(${measured.background}) is darker than its accent background`,
    ).toBeGreaterThan(backgroundLuminance);
  });
}

test("Navi controls keep a visible selected state", async ({ page }) => {
  // Neon Auth's unlayered Tailwind preflight once stripped border, background,
  // and radius off every Navi component, leaving the setup control looking like
  // flat text. This asserts the selected option is still distinguishable.
  await page.goto("/play", { waitUntil: "networkidle" });
  const control = page.locator(".navi-segmented").first();
  await expect(control).toBeVisible();

  const state = await control.evaluate((element) => {
    const container = getComputedStyle(element);
    const read = (button: Element | null) => {
      if (!button) return null;
      const style = getComputedStyle(button);
      return { background: style.backgroundColor, color: style.color };
    };
    return {
      borderWidth: parseFloat(container.borderTopWidth),
      selected: read(element.querySelector('button[aria-checked="true"]')),
      unselected: read(element.querySelector('button[aria-checked="false"]')),
    };
  });

  expect(state.borderWidth, "segmented control lost its border").toBeGreaterThan(0);
  expect(state.selected, "no selected option").not.toBeNull();
  expect(state.unselected, "no unselected option").not.toBeNull();
  const distinguishable =
    state.selected!.background !== state.unselected!.background
    || state.selected!.color !== state.unselected!.color;
  expect(distinguishable, "selected and unselected options render identically").toBe(true);
});
