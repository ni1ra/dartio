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
    await page.locator(`button:has-text("${theme}")`).first().click();
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
