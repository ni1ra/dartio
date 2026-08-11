import { expect, test, type Page, type Route } from "@playwright/test";

const MATCH = "/play/match?start=501&best=1&out=double&opponent=local";
const PRO_ACCESS = {
  auth: "authenticated",
  effectivePlan: "pro",
  accessState: "active",
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  entitlements: [
    "local_scoring",
    "basic_checkout",
    "advanced_checkout",
    "online_multiplayer",
    "voice_always_on",
    "advanced_ai",
    "deep_stats",
    "custom_practice",
  ],
  limits: { aiMaxLevel: 20, historyMatches: null, onlineSeats: 8 },
  availability: {
    localScoring: "implemented",
    advancedAi: "implemented",
    advancedCheckout: "implemented",
    voiceInput: "implemented",
    history: "implemented",
    deepStats: "implemented",
    onlineMultiplayer: "implemented",
    customPractice: "coming_soon",
    clubManagement: "coming_soon",
  },
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

/**
 * Supplies a deterministic push-to-talk microphone without bypassing the UI.
 * The fake emits one non-empty audio blob when the player releases the button,
 * so the component still exercises permission, recording, FormData, and fetch.
 */
async function installMicrophone(page: Page) {
  await page.addInitScript(() => {
    const voiceWindow = window as typeof window & {
      __voiceLevels?: number[];
      __voiceRecorderStarts?: number;
      __voiceTrackStops?: number;
      __voiceHidden?: boolean;
      __voicePermissionDeferred?: boolean;
      __voiceResolvePermission?: () => void;
    };
    voiceWindow.__voiceLevels = [];
    voiceWindow.__voiceRecorderStarts = 0;
    voiceWindow.__voiceTrackStops = 0;
    voiceWindow.__voiceHidden = false;
    voiceWindow.__voicePermissionDeferred = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => voiceWindow.__voiceHidden ?? false,
    });
    const track = {
      stop() {
        voiceWindow.__voiceTrackStops =
          (voiceWindow.__voiceTrackStops ?? 0) + 1;
      },
    };
    const media = { getTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => {
          if (!voiceWindow.__voicePermissionDeferred)
            return Promise.resolve(media);
          return new Promise<MediaStream>((resolve) => {
            voiceWindow.__voiceResolvePermission = () => {
              voiceWindow.__voicePermissionDeferred = false;
              voiceWindow.__voiceResolvePermission = undefined;
              resolve(media);
            };
          });
        },
      },
    });

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state: RecordingState = "inactive";
      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType ?? "audio/webm";
      }

      start() {
        this.state = "recording";
        voiceWindow.__voiceRecorderStarts =
          (voiceWindow.__voiceRecorderStarts ?? 0) + 1;
      }

      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["voice"], { type: this.mimeType }),
        } as BlobEvent);
        window.queueMicrotask(() => this.onstop?.());
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });

    class FakeAudioContext {
      currentTime = 0;

      createAnalyser() {
        return {
          fftSize: 1024,
          getFloatTimeDomainData: (frame: Float32Array) => {
            const level = voiceWindow.__voiceLevels?.shift() ?? 0;
            frame.fill(level);
            this.currentTime += 0.25;
          },
        };
      }

      createMediaStreamSource() {
        return { connect() {} };
      }

      close() {
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
    window.localStorage.clear();
  });
}

async function openVoiceMatch(page: Page) {
  await installMicrophone(page);
  await page.route("**/api/access", (route) => json(route, 200, PRO_ACCESS));
  await page.goto(MATCH, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Hold to record a voice score" })).toBeVisible();
}

async function startSpeaking(page: Page) {
  const hold = page.getByRole("button", { name: "Hold to record a voice score" });
  await hold.scrollIntoViewIfNeeded();
  await hold.hover();
  await page.mouse.down();
  await expect(page.locator(".voice-recording")).toBeVisible();
  return hold;
}

async function speak(page: Page) {
  await startSpeaking(page);
  await page.mouse.up();
}

function playerScore(page: Page) {
  return page.locator(".score-player").first().locator("strong");
}

test("releasing push-to-talk while permission is pending records and sends nothing", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/voice/transcribe", (route) => {
    requests += 1;
    return json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 0.99,
    });
  });
  await openVoiceMatch(page);
  await page.evaluate(() => {
    const voiceWindow = window as typeof window & {
      __voicePermissionDeferred?: boolean;
    };
    voiceWindow.__voicePermissionDeferred = true;
  });

  const hold = page.getByRole("button", { name: "Hold to record a voice score" });
  await hold.scrollIntoViewIfNeeded();
  await hold.hover();
  await page.mouse.down();
  await expect(page.locator(".voice-requesting")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".voice-idle")).toBeVisible();

  expect(requests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceRecorderStarts?: number })
            .__voiceRecorderStarts ?? 0,
      ),
    )
    .toBe(0);

  await page.evaluate(() => {
    const resolve = (
      window as typeof window & { __voiceResolvePermission?: () => void }
    ).__voiceResolvePermission;
    if (!resolve) throw new Error("Deferred microphone permission was not pending");
    resolve();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceTrackStops?: number })
            .__voiceTrackStops ?? 0,
      ),
    )
    .toBe(1);
  await expect(page.locator(".voice-idle")).toBeVisible();
  expect(requests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceRecorderStarts?: number })
            .__voiceRecorderStarts ?? 0,
      ),
    )
    .toBe(0);
});

test("push-to-talk always waits for explicit review even when confidence is high", async ({ page }) => {
  await page.route("**/api/voice/transcribe", (route) =>
    json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 0.99,
    }),
  );
  await openVoiceMatch(page);

  await speak(page);
  await expect(page.locator(".voice-result.held")).toContainText("99% confidence");
  await expect(page.locator(".voice-result.held")).toContainText(
    "Push-to-talk always waits for your explicit confirmation.",
  );
  await expect(playerScore(page)).toHaveText("501");
  const confirmBox = await page
    .getByRole("button", { name: "Confirm oldest" })
    .boundingBox();
  expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Confirm oldest" }).click();
  await expect(playerScore(page)).toHaveText("441");
  await expect(page.locator(".voice-result.held")).toHaveCount(0);
});

test("hands-free records only after speech, auto-applies a clear command, and re-arms", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/voice/transcribe", (route) => {
    requests += 1;
    return json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 0.99,
    });
  });
  await openVoiceMatch(page);

  await page.getByRole("button", { name: "Start continuous hands-free listening" }).click();
  await expect(page.getByRole("button", { name: "Stop continuous hands-free listening" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(250);
  expect(requests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceRecorderStarts?: number })
            .__voiceRecorderStarts ?? 0,
      ),
    )
    .toBe(0);

  // Losing visibility closes the idle microphone without manufacturing a clip.
  await page.evaluate(() => {
    const voiceWindow = window as typeof window & { __voiceHidden?: boolean };
    voiceWindow.__voiceHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "Start continuous hands-free listening" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(requests).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceTrackStops?: number })
            .__voiceTrackStops ?? 0,
      ),
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    const voiceWindow = window as typeof window & {
      __voiceHidden?: boolean;
      __voiceLevels?: number[];
    };
    voiceWindow.__voiceHidden = false;
    voiceWindow.__voiceLevels = [0.2, 0.2, 0.2, 0, 0, 0, 0];
  });
  await page.getByRole("button", { name: "Start continuous hands-free listening" }).click();
  await expect(playerScore(page)).toHaveText("441");
  expect(requests).toBe(1);
  await expect(page.getByRole("button", { name: "Stop continuous hands-free listening" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The next quiet listening cycle is armed but owns neither a recorder nor a
  // request. Unmounting it therefore cannot turn idle ambience into a fetch.
  await page.waitForTimeout(250);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceRecorderStarts?: number })
            .__voiceRecorderStarts ?? 0,
      ),
    )
    .toBe(1);
  expect(requests).toBe(1);
  const stopsBeforeUnmount = await page.evaluate(
    () =>
      (window as typeof window & { __voiceTrackStops?: number })
        .__voiceTrackStops ?? 0,
  );
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  expect(requests).toBe(1);
  // The re-armed idle listener owns a stream even though it owns no recorder;
  // unmount still has to release that track.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __voiceTrackStops?: number })
            .__voiceTrackStops ?? 0,
      ),
    )
    .toBeGreaterThan(stopsBeforeUnmount);
});

test("confidence feeds the FIFO hold queue without gameplay leapfrogging", async ({ page }) => {
  const replies = [
    { transcript: "treble twenty", command: { type: "dart", segment: 20, multiplier: 3 }, confidence: 0.24 },
    { transcript: "double sixteen", command: { type: "dart", segment: 16, multiplier: 2 }, confidence: 0.98 },
    { transcript: "confirm", command: { type: "confirm" }, confidence: 0.2 },
    { transcript: "confirm", command: { type: "confirm" }, confidence: 0.99 },
    { transcript: "double sixteen", command: { type: "dart", segment: 16, multiplier: 2 }, confidence: 0.31 },
  ];
  let request = 0;
  await page.route("**/api/voice/transcribe", (route) =>
    json(route, 200, replies[request++] ?? replies.at(-1)),
  );
  await openVoiceMatch(page);

  await speak(page);
  await expect(page.locator(".voice-result.held")).toContainText("24% confidence");
  await expect(playerScore(page)).toHaveText("501");

  // A later clear command waits behind the doubtful one instead of leapfrogging.
  await speak(page);
  await expect(page.locator(".voice-result.held")).toContainText("1 OF 2");
  await expect(playerScore(page)).toHaveText("501");

  // A doubtful control word cannot resolve a doubtful score.
  await speak(page);
  await expect(page.getByText(/confirmation was also uncertain/i)).toBeVisible();
  await expect(page.locator(".voice-result.held")).toContainText("1 OF 2");
  await expect(playerScore(page)).toHaveText("501");

  // The confident control resolves the oldest item. Advancing the match clears
  // the remaining item because it was heard against the previous state.
  await speak(page);
  await expect(playerScore(page)).toHaveText("441");
  await expect(page.locator(".voice-result.held")).toHaveCount(0);

  await speak(page);
  await expect(page.locator(".voice-result.held")).toContainText("31% confidence");
  await page.getByRole("button", { name: "Discard oldest" }).click();
  await expect(page.locator(".voice-result.held")).toHaveCount(0);
  await expect(playerScore(page)).toHaveText("441");
});

test("a response released immediately after a match commit cannot apply stale voice", async ({ page }) => {
  const responseGate = deferred();
  const requestGate = deferred();
  await page.route("**/api/voice/transcribe", async (route) => {
    requestGate.resolve();
    await responseGate.promise;
    await json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 0.99,
    }).catch(() => undefined);
  });
  await openVoiceMatch(page);

  await page.getByRole("tab", { name: "Each dart" }).click();
  await page.evaluate(() => {
    (
      window as typeof window & { __voiceLevels?: number[] }
    ).__voiceLevels = [0.2, 0.2, 0.2, 0, 0, 0, 0];
  });
  await page.getByRole("button", { name: "Start continuous hands-free listening" }).click();
  await requestGate.promise;

  // DOM click commits the manual dart synchronously. Releasing the response in
  // the very next host turn targets the render→layout/passive-effect seam rather
  // than waiting for a visible score assertion to make the request obviously old.
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((candidate) => candidate.getAttribute("aria-label") === "Treble 20, 60 points");
    if (!button) throw new Error("Treble 20 input was not rendered");
    button.click();
  });
  responseGate.resolve();
  await expect(playerScore(page)).toHaveText("441");
  await expect(page.locator(".voice-result.held")).toHaveCount(0);
});

test("the surface rejects malformed success payloads and always exposes a safe stop", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/voice/transcribe", (route) => {
    requests += 1;
    return json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 1.2,
    });
  });
  await openVoiceMatch(page);

  await expect(page.getByText(/capped at 9 seconds/i)).toBeVisible();
  const handsFree = page.getByRole("button", { name: "Start continuous hands-free listening" });
  await expect(handsFree).toHaveAttribute("aria-pressed", "false");

  await speak(page);
  await expect(page.locator('.voice-error[role="alert"]')).toContainText(
    "invalid response",
  );
  await expect(playerScore(page)).toHaveText("501");
  await page.getByRole("button", { name: "Dismiss" }).click();

  const hold = await startSpeaking(page);
  await hold.dispatchEvent("pointercancel", { pointerType: "mouse", pointerId: 1 });
  await expect(page.locator(".voice-idle")).toBeVisible();
  await page.mouse.up();
  expect(requests).toBe(1);

  // Processing itself has an emergency stop; the control is intentionally not
  // disabled while the network owns an in-flight request.
  const responseGate = deferred();
  await page.unroute("**/api/voice/transcribe");
  await page.route("**/api/voice/transcribe", async (route) => {
    await responseGate.promise;
    await json(route, 200, {
      transcript: "treble twenty",
      command: { type: "dart", segment: 20, multiplier: 3 },
      confidence: 0.99,
    }).catch(() => undefined);
  });
  await speak(page);
  const stop = page.getByRole("button", { name: "Stop voice capture and processing" });
  await expect(stop).toBeEnabled();
  await stop.click();
  responseGate.resolve();
  await expect(page.locator(".voice-idle")).toBeVisible();
  await expect(playerScore(page)).toHaveText("501");
});
