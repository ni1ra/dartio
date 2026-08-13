import type { Page, Response } from "@playwright/test";

/**
 * Wait for React's streamed App Router segments to replace their hidden
 * transport buffers. DOMContentLoaded can fire while both the hidden segment
 * and its visible replacement exist, whereas networkidle can wait forever on
 * deployment tooling that is unrelated to Dartio.
 */
async function waitForDartioDocument(page: Page) {
  await page.waitForFunction(() => (
    document.readyState !== "loading"
    && document.querySelector("main") !== null
    && document.querySelector('template[id^="B:"]') === null
    && document.querySelector('[id^="S:"][hidden]') === null
    // AccountNav removes this placeholder from a client effect after session
    // authority resolves. Its absence is the app-owned signal that React has
    // attached handlers, not merely streamed visible server markup.
    && document.querySelector(".account-nav--pending") === null
  ));
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  }));
}

export async function gotoDartio(page: Page, url: string): Promise<Response | null> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDartioDocument(page);
  return response;
}

export async function reloadDartio(page: Page): Promise<Response | null> {
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDartioDocument(page);
  return response;
}
