# Cycle 26 — Voice Confidence, End to End

Status: active on branch `codex/cycle-26-voice-confidence`.

Fourth cycle of `PHASE_3_promise_completion.md`. The continuous voice lifecycle
already knew how to segment speech and the dialogue layer already had a hold
queue, but the deployed transcription boundary returned no confidence. Every
understood hands-free command therefore bypassed the queue. This cycle carries
a real provider signal through the boundary and hardens the microphone,
asynchronous, review, and cleanup paths that become consequential once the queue
is live.

## Researched provider contract

OpenAI's current Transcriptions API documents `gpt-4o-mini-transcribe` with
`response_format: "json"` and `include: ["logprobs"]`. The returned evidence is
token-level log probability; OpenAI does not define a calibrated utterance
correctness probability or a product threshold. Dartio therefore owns both the
aggregation rule and the 0.6 review floor.

The server computes `exp(mean(token logprobs))`. Missing, empty, non-numeric,
non-finite, positive, or partly malformed logprobs fail closed to `0`; they never
become implicit certainty. The result is the model's own confidence signal, not
a claim that the command has that probability of being correct.

Primary sources, read 2026-08-11:

- [Create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
- [GPT-4o mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe)

## Boundary

`POST /api/voice/transcribe` remains behind the canonical authenticated,
available `voice_always_on` entitlement. It requests JSON plus logprobs from the
configured `gpt-4o-mini-transcribe` model alias and forwards the request's abort
signal. Success is
exactly `{ transcript, command, confidence }`; raw provider tokens and logprobs
never cross into the browser. Every success and refusal is `private, no-store`.
Malformed audio, unsupported file types, an invalid language, an aborted request,
and a provider failure remain sanitized and fail closed.

The 10 MB application limit is still checked after `request.formData()` has
parsed the multipart body. Replacing that with a streaming multipart parser is
transport hardening, not evidence that the confidence path works, and is not
silently claimed here.

## Product contract

- Push-to-talk keeps its explicit review promise. A clear transcript is shown
  and must be applied by the player; it never scores merely because its model
  signal clears the hands-free threshold.
- Opt-in hands-free mode may apply one clear command immediately. A doubtful
  command is held; later gameplay commands join the FIFO queue instead of
  changing the match ahead of it. Spoken confirm or cancel must itself clear the
  confidence floor, while the visible controls are deliberate trusted actions.
- Match revision, disabled/access state, visibility loss, window blur,
  navigation, and unmount invalidate capture and in-flight transcription. A
  late response cannot score a newer match state.
- Hands-free monitoring may keep the deliberately opened microphone ready, but
  the recorder and its nine-second cap begin only when speech begins. Idle room
  audio is not retained or sent. Pointer, touch, keyboard, and emergency-stop
  paths all have a deterministic exit.
- The surface validates the complete runtime response before it reaches the
  dialogue state, exposes pressed/live semantics, and tells the truth about
  automatic hands-free application and review.

Voice control is still mounted only on X01. Expanding its vocabulary and UI into
every other mode remains the separate Phase 1 product row; this cycle does not
rename an X01 proof as cross-mode completion.

## Queue

- [x] Research and lock the current transcription/logprob contract.
- [x] Add the fail-closed confidence aggregate and exact private response
  boundary with deterministic unit and route coverage.
- [x] Wire confidence into the production dialogue, preserve push-to-talk
  review, enforce hands-free FIFO, and invalidate stale work on every match and
  lifecycle boundary.
- [x] Put the rendered X01 voice surface under browser test at 390×844,
  834×1112, and 1440×1000, including review, auto-apply, hold, no leapfrog,
  malformed response, cancellation, and cleanup.
- [x] Add `pnpm verify:voice:live <deployment-url>` with a checked-in synthetic
  speech fixture, strict origin/credential handling, anonymous refusal,
  entitlement proof, exact command/confidence validation, and no sensitive
  logging.
- [x] Full local typecheck, lint, unit, build, and browser gates.
- [ ] Exact Preview deployment, trusted-origin/auth proof, available Preview
  voice evidence, touched browser matrix, and CI.
- [ ] Merge only a green exact revision; repeat auth, history, rooms, premium AI,
  voice, touched browser, full browser, and main-CI proof on Production.

## Live verifier safety

The fixture is Windows text-to-speech saying “treble twenty”; it is not a user's
recording. The verifier prints no audio, transcript, token, confidence value,
cookie, or credential. It does not create an account, match, billing row, or
product row. Signing in the existing QA identity necessarily creates the
ordinary short-lived auth session used to exercise the paid route, so the gate
is application-data-safe rather than literally non-mutating.

## Receipts

Local candidate, 2026-08-12:

- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0, zero warnings.
- `pnpm test` — 53 files, 788 tests passed, exit 0.
- Focused confidence, route, dialogue, segmenter, and verifier suite — 6 files,
  152/152 passed, exit 0.
- All four live-verifier modules passed `node --check`; `git diff --check`
  passed with only platform line-ending notices.
- `CI=1 pnpm exec playwright test tests/browser/voice.spec.ts` — a fresh build
  and 18/18 rendered voice stories passed at 390×844, 834×1112, and 1440×1000.
  The added regressions prove that releasing while microphone permission is
  pending starts no recorder or request and that a response released directly
  after a newer match commit cannot apply stale voice; exit 0.
- `CI=1 pnpm test:browser` — a second fresh build and all 249 collected checks:
  245 passed and the four documented viewport-inapplicable layout assertions
  skipped by design; exit 0 in 252.8 seconds.

PR, Preview, merge, and Production receipts remain deliberately unrecorded
until the stabilized exact revision reaches each gate.
