import { expect, test, type Page } from "@playwright/test";

const MATCH = "/play/match?start=501&best=5&out=double&opponent=local";

interface WakeLockProbe {
  requests: number;
  releases: number;
  visibility: DocumentVisibilityState;
  deferred: boolean;
  resolveRequest: (() => void) | null;
  current: { released: boolean; dispatchEvent(event: Event): boolean; release(): Promise<void> } | null;
}

interface WakeLockOptions {
  readonly deferred?: boolean;
  readonly outcome?: "grant" | "denied" | "unsupported";
}

/** Installs a deterministic browser-level Wake Lock API before React hydrates. */
async function installWakeLockProbe(page: Page, options: WakeLockOptions = {}) {
  await page.addInitScript(({ deferredRequest, outcome }) => {
    const probe: WakeLockProbe = {
      requests: 0,
      releases: 0,
      visibility: "visible",
      deferred: deferredRequest,
      resolveRequest: null,
      current: null,
    };
    Object.defineProperty(window, "__wakeLockProbe", { value: probe });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => probe.visibility,
    });

    if (outcome === "unsupported") {
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        async request(type: string) {
          if (type !== "screen") throw new TypeError("Unexpected lock type");
          probe.requests += 1;
          if (outcome === "denied") throw new DOMException("Denied", "NotAllowedError");
          if (probe.deferred) {
            probe.deferred = false;
            await new Promise<void>((resolve) => { probe.resolveRequest = resolve; });
            probe.resolveRequest = null;
          }
          const target = new EventTarget();
          const sentinel = Object.assign(target, {
            released: false,
            async release() {
              if (sentinel.released) return;
              sentinel.released = true;
              probe.releases += 1;
              sentinel.dispatchEvent(new Event("release"));
            },
          });
          probe.current = sentinel;
          return sentinel;
        },
      },
    });
  }, {
    deferredRequest: options.deferred ?? false,
    outcome: options.outcome ?? "grant",
  });
}

async function wakeProbe(page: Page): Promise<Pick<WakeLockProbe, "requests" | "releases">> {
  return page.evaluate(() => {
    const probe = (window as typeof window & { __wakeLockProbe: WakeLockProbe }).__wakeLockProbe;
    return { requests: probe.requests, releases: probe.releases };
  });
}

test("an active match owns one screen wake lock and releases it when leaving", async ({ page }) => {
  await installWakeLockProbe(page);
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 0 });

  await page.getByRole("link", { name: "Dartio home" }).click();
  await page.waitForURL("/");
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 1 });
});

test("a visible match reacquires the screen lock after the browser releases it", async ({ page }) => {
  await installWakeLockProbe(page);
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 0 });

  await page.evaluate(() => {
    const probe = (window as typeof window & { __wakeLockProbe: WakeLockProbe }).__wakeLockProbe;
    probe.visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 1 });

  await page.evaluate(() => {
    const probe = (window as typeof window & { __wakeLockProbe: WakeLockProbe }).__wakeLockProbe;
    probe.visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 2, releases: 1 });
});

test("finishing a match releases the screen wake lock without leaving the route", async ({ page }) => {
  await installWakeLockProbe(page);
  await page.goto("/play/match?mode=shanghai", { waitUntil: "networkidle" });
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 0 });

  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("1");
  await page.keyboard.press("d");
  await page.keyboard.press("1");
  await page.keyboard.press("t");
  await expect(page.locator(".match-complete")).toContainText("MATCH COMPLETE");
  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 1 });
});

test("a lock granted after hidden-to-visible is released before the fresh lock wins", async ({ page }) => {
  await installWakeLockProbe(page, { deferred: true });
  await page.goto(MATCH, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await wakeProbe(page)).requests).toBe(1);

  await page.evaluate(() => {
    const probe = (window as typeof window & { __wakeLockProbe: WakeLockProbe }).__wakeLockProbe;
    probe.visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    probe.visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    probe.resolveRequest?.();
  });

  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 2, releases: 1 });
});

test("a wake lock granted after the match unmounts is released immediately", async ({ page }) => {
  await installWakeLockProbe(page, { deferred: true });
  await page.goto(MATCH, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await wakeProbe(page)).requests).toBe(1);

  await page.getByRole("link", { name: "Dartio home" }).click();
  await page.waitForURL("/");
  await page.evaluate(() => {
    const probe = (window as typeof window & { __wakeLockProbe: WakeLockProbe }).__wakeLockProbe;
    probe.resolveRequest?.();
  });

  await expect.poll(() => wakeProbe(page)).toEqual({ requests: 1, releases: 1 });
});

test("scoring remains available when screen wake lock is unsupported", async ({ page }) => {
  await installWakeLockProbe(page, { outcome: "unsupported" });
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".current-darts .filled")).toContainText("T20");
});

test("scoring remains available when screen wake lock permission is denied", async ({ page }) => {
  await installWakeLockProbe(page, { outcome: "denied" });
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".current-darts .filled")).toContainText("T20");
});

test("an already-loaded local match still records a dart while the network is offline", async ({ page, context }) => {
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Each dart" }).click();
  await context.setOffline(true);
  try {
    await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
    await expect(page.locator(".current-darts .filled")).toContainText("T20");
    await expect.poll(() => page.evaluate(() => {
      const raw = window.localStorage.getItem("dartio:x01-log:v2:local");
      if (!raw) return false;
      const envelope = JSON.parse(raw) as { log?: string };
      if (typeof envelope.log !== "string") return false;
      const log = JSON.parse(envelope.log) as { events?: Array<{ segment?: number; multiplier?: number }> };
      return log.events?.some((event) => event.segment === 20 && event.multiplier === 3) ?? false;
    })).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});

test("undoing the only round dart removes the resume slot", async ({ page }) => {
  const key = "dartio:round-log:v3:countUp:solo";
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect(page.locator(".round-totals strong").first()).toHaveText("60");
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull();
  await page.getByRole("button", { name: "Undo last dart" }).click();
  await expect(page.locator(".round-totals strong").first()).toHaveText("0");
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBeNull();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".round-totals strong").first()).toHaveText("0");
});

test("rewinding the first completed round visit removes the resume slot", async ({ page }) => {
  const key = "dartio:round-log:v3:countUp:solo";
  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  for (let dart = 0; dart < 3; dart += 1) {
    await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  }
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull();
  await page.locator(".match-tools").getByRole("button", { name: "Correct a visit" }).click();
  await page.locator(".correction-visits li").first().getByRole("button", { name: "Rewind here" }).click();
  await expect(page.locator(".round-totals strong").first()).toHaveText("0");
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBeNull();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".round-totals strong").first()).toHaveText("0");
});

test("undoing the only drill dart removes the resume slot", async ({ page }) => {
  const key = "dartio:drill-log:v2:doublesMatrix";
  await page.goto("/play/match?drill=doublesMatrix", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Treble 20, 60 points" }).click();
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).not.toBeNull();
  await page.getByRole("button", { name: "Undo last dart" }).click();
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key)).toBeNull();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".drill-target strong")).toHaveText("1");
});

test("future-version round and drill resumes survive initial hydration untouched", async ({ page }) => {
  const roundKey = "dartio:round-log:v3:countUp:solo";
  const drillKey = "dartio:drill-log:v2:doublesMatrix";
  const futureRound = '{ "storageVersion": 77, "writer": "future-round" }';
  const futureDrill = '{ "rulesVersion": 88, "writer": "future-drill" }';

  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(({ round, drill, roundRaw, drillRaw }) => {
    window.localStorage.setItem(round, roundRaw);
    window.localStorage.setItem(drill, drillRaw);
  }, { round: roundKey, drill: drillKey, roundRaw: futureRound, drillRaw: futureDrill });

  await page.goto("/play/match?mode=countUp", { waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".round-totals strong").first()).toHaveText("0");
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), roundKey)).toBe(futureRound);

  await page.goto("/play/match?drill=doublesMatrix", { waitUntil: "networkidle" });
  await expect(page.locator(".match-notice")).toHaveCount(0);
  await expect(page.locator(".drill-target strong")).toHaveText("1");
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), drillKey)).toBe(futureDrill);
});

test("the manifest and install icons describe the shipped app without an offline worker", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json() as {
    id: string;
    start_url: string;
    display: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  };
  expect(manifest).toMatchObject({ id: "/", start_url: "/play", display: "standalone" });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/dartio-192.png", sizes: "192x192", type: "image/png" }),
    expect.objectContaining({ src: "/icons/dartio-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/dartio-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
  ]));

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"], icon.src).toBe("image/png");
  }

  await page.goto("/", { waitUntil: "networkidle" });
  for (const icon of new Map(manifest.icons.map((entry) => [entry.src, entry])).values()) {
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, icon.src);
    const [width, height] = icon.sizes.split("x").map(Number);
    expect(dimensions, icon.src).toEqual({ width, height });
  }
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
  expect(await page.evaluate(async () => navigator.serviceWorker
    ? (await navigator.serviceWorker.getRegistrations()).length
    : 0)).toBe(0);
  expect((await request.get("/service-worker.js")).status()).toBe(404);
  expect((await request.get("/sw.js")).status()).toBe(404);
});

test("the match recovery layout is responsive and keyboard reachable", async ({ page }, testInfo) => {
  await page.goto(MATCH, { waitUntil: "networkidle" });
  // `route-error.test.ts` renders the real boundary. This browser fixture keeps
  // the production route graph clean and proves that component's exact classes
  // in the three release viewports.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) throw new Error("No main content to replace");
    main.innerHTML = `
      <div class="page-frame route-error" role="alert" aria-labelledby="route-error-title">
        <div class="route-error__signal" aria-hidden="true"><span>!</span></div>
        <div class="route-error__copy">
          <span class="eyebrow">Match interrupted</span>
          <h1 id="route-error-title">Your saved match is still here.</h1>
          <div class="route-error__detail"><p>Darts already saved on this device are untouched. In a room, every submitted visit remains on the server.</p><p>A dart still waiting to be submitted may need to be thrown again.</p></div>
          <div class="route-error__actions"><button class="button-link">Try again</button><a class="button-link button-link-secondary" href="/play">Back to setup</a></div>
          <small>Neither action clears saved match data.</small>
        </div>
      </div>`;
  });

  const recovery = page.locator(".route-error[role='alert']");
  await expect(recovery).toContainText("saved match is still here");
  await expect(recovery).toContainText("every submitted visit remains on the server");
  await expect(recovery).toContainText("waiting to be submitted may need to be thrown again");

  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    actions: [...document.querySelectorAll<HTMLElement>(".route-error__actions .button-link")].map((element) => element.getBoundingClientRect().height),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.actions).toHaveLength(2);
  expect(geometry.actions.every((height) => height >= 44)).toBe(true);

  await page.getByRole("button", { name: "Try again" }).focus();
  await expect(page.getByRole("button", { name: "Try again" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Back to setup" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("recovery.png"), fullPage: true });
});
