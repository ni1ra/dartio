"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Surface } from "navi-ui";
import { voiceCommandSchema, type VoiceCommand } from "@/lib/voice/commands";
import {
  clearDialogue,
  createDialogue,
  hearCommand,
  pending,
  type DialogueState,
  type VoiceMode,
} from "@/lib/voice/dialogue";
import { createSegmenter, frameLevel, observeLevel } from "@/lib/voice/segmenter";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { RecordDotIcon } from "./icons";
import { useAccess } from "./access-provider";

type VoicePhase =
  | "idle"
  | "requesting"
  | "recording"
  | "listening"
  | "paused"
  | "processing"
  | "confirm"
  | "ambiguous"
  | "denied"
  | "error";
type VoiceResult = {
  transcript: string;
  command: VoiceCommand | null;
  confidence: number;
  reason:
    | "unheard"
    | "out-of-vocabulary"
    | "nothing-pending"
    | "uncertain-control";
};
type VoiceTranscription = {
  transcript: string;
  command: VoiceCommand | null;
  confidence: number;
};
type VoiceRequest = {
  readonly id: number;
  readonly revision: number;
};
type VoiceControlProps = {
  disabled?: boolean;
  /** Changes whenever the match advances, invalidating captured audio and held scores. */
  revision: number;
  mode?: VoiceMode;
  onDart: (segment: number, multiplier: 1 | 2 | 3) => void;
  onTurnScore: (score: number) => void;
  onUndo: () => void;
  onNextPlayer: () => void;
};

export function VoiceControl({
  disabled = false,
  revision,
  mode = "x01",
  onDart,
  onTurnScore,
  onUndo,
  onNextPlayer,
}: VoiceControlProps) {
  const access = useAccess();
  const [phase, setPhase] = useState<VoicePhase>("idle"),
    [alwaysOn, setAlwaysOn] = useState(false),
    [result, setResult] = useState<VoiceResult | null>(null),
    [dialogue, setDialogue] = useState<DialogueState>(createDialogue),
    [error, setError] = useState<string | null>(null);
  const phaseRef = useRef<VoicePhase>("idle"),
    dialogueRef = useRef(dialogue),
    previousRevision = useRef(revision),
    revisionRef = useRef(revision),
    voiceEnabledRef = useRef(false);
  const audio = useRef<AudioContext | null>(null),
    monitorFrame = useRef<number | null>(null),
    segmenter = useRef(createSegmenter());
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    cycleTimer = useRef<number | null>(null),
    permissionTimer = useRef<number | null>(null),
    requestGeneration = useRef(0),
    transcription = useRef<AbortController | null>(null),
    holdActive = useRef(false),
    discard = useRef(false),
    restartAfterStop = useRef(false),
    afterCaptureStop = useRef<(() => void) | null>(null),
    alive = useRef(true),
    alwaysRef = useRef(false),
    disabledRef = useRef(disabled),
    beginRef = useRef<(mode: "push" | "always") => Promise<void>>(async () => undefined),
    invalidateCaptureRef = useRef<(restart: boolean) => void>(() => undefined);
  disabledRef.current = disabled;
  revisionRef.current = revision;
  useEffect(() => {
    alwaysRef.current = alwaysOn;
  }, [alwaysOn]);
  useLayoutEffect(() => {
    // Strict Mode deliberately runs setup → cleanup → setup in development.
    // Re-arm the instance so the real setup does not inherit the probe cleanup.
    alive.current = true;
    return () => {
      alive.current = false;
      restartAfterStop.current = false;
      afterCaptureStop.current = null;
      requestGeneration.current += 1;
      transcription.current?.abort();
      transcription.current = null;
      clearPermissionTimer();
      clearCycle();
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopMonitor();
      stopStream();
    };
  }, []);
  useLayoutEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    const restart = alwaysRef.current && !disabledRef.current;
    invalidateCaptureRef.current(restart);
    const nextDialogue = clearDialogue(dialogueRef.current);
    dialogueRef.current = nextDialogue;
    phaseRef.current = restart ? "paused" : "idle";
    const frame = window.requestAnimationFrame(() => {
      if (!alive.current || previousRevision.current !== revision) return;
      setDialogue(nextDialogue);
      setResult(null);
      setError(null);
      setPhase(phaseRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revision]);
  useLayoutEffect(() => {
    if (!disabled) return;
    alwaysRef.current = false;
    invalidateCaptureRef.current(false);
    const nextDialogue = clearDialogue(dialogueRef.current);
    dialogueRef.current = nextDialogue;
    phaseRef.current = "idle";
    const frame = window.requestAnimationFrame(() => {
      if (!alive.current || !disabledRef.current) return;
      setAlwaysOn(false);
      setDialogue(nextDialogue);
      setResult(null);
      setPhase("idle");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [disabled]);

  const voiceEnabled = access.status === "ready" && isProductAvailable(access.snapshot, "voiceInput") && hasAccessEntitlement(access.snapshot, "voice_always_on");
  voiceEnabledRef.current = voiceEnabled;
  useLayoutEffect(() => {
    if (voiceEnabled) return;
    alwaysRef.current = false;
    invalidateCaptureRef.current(false);
    const nextDialogue = clearDialogue(dialogueRef.current);
    dialogueRef.current = nextDialogue;
    phaseRef.current = "idle";
    const frame = window.requestAnimationFrame(() => {
      if (!alive.current) return;
      setAlwaysOn(false);
      setDialogue(nextDialogue);
      setResult(null);
      setError(null);
      setPhase("idle");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [voiceEnabled]);
  useEffect(() => {
    const abandonCapture = () => {
      alwaysRef.current = false;
      setAlwaysOn(false);
      invalidateCaptureRef.current(false);
      setError(null);
      changePhase(pending(dialogueRef.current).length > 0 ? "confirm" : "idle");
    };
    const abandonHiddenCapture = () => {
      if (document.hidden) abandonCapture();
    };
    window.addEventListener("blur", abandonCapture);
    document.addEventListener("visibilitychange", abandonHiddenCapture);
    return () => {
      window.removeEventListener("blur", abandonCapture);
      document.removeEventListener("visibilitychange", abandonHiddenCapture);
    };
  }, []);
  if (!voiceEnabled) {
    const loading = access.status === "loading";
    const unavailable = access.status === "unavailable";
    const anonymous = access.status === "ready" && access.snapshot.auth === "anonymous";
    return <Surface className={`voice-console voice-access ${unavailable?"unavailable":"locked"}`} aria-busy={loading||undefined} aria-label="Voice score input access"><header><div><span className="voice-kicker">VOICE INPUT</span><h3>{loading?"Checking voice access":unavailable?"Voice access unavailable":"Voice scoring is a Pro feature"}</h3></div><span className="voice-state"><i />{loading?"CHECKING":unavailable?"UNAVAILABLE":"LOCKED"}</span></header><p className="voice-guidance">{loading?"Local scoring stays ready while Dartio checks this feature.":unavailable?"Dartio could not verify paid access. Your match and manual scoring are unaffected.":"Pro includes push-to-talk and opt-in hands-free voice scoring."}</p><div className="voice-access-actions">{unavailable?<Button variant="secondary" onClick={()=>void access.retry()}>Retry access</Button>:anonymous?<><Link className="button-link" href="/auth/sign-in">Sign in</Link><Link className="button-link button-link-secondary" href="/pricing">View Pro</Link></>:!loading?<Link className="button-link" href="/pricing">Upgrade to Pro</Link>:null}</div></Surface>;
  }

  function changePhase(next: VoicePhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function storeDialogue(next: DialogueState) {
    dialogueRef.current = next;
    setDialogue(next);
  }

  function isRequestContextCurrent(request: VoiceRequest) {
    return (
      alive.current &&
      revisionRef.current === request.revision &&
      !disabledRef.current &&
      voiceEnabledRef.current
    );
  }

  function isRequestCurrent(request: VoiceRequest) {
    return (
      requestGeneration.current === request.id &&
      isRequestContextCurrent(request)
    );
  }

  function scheduleAlwaysRestart() {
    if (
      !alive.current ||
      !alwaysRef.current ||
      disabledRef.current ||
      !voiceEnabledRef.current
    )
      return;
    clearCycle();
    cycleTimer.current = window.setTimeout(() => {
      cycleTimer.current = null;
      if (
        alive.current &&
        alwaysRef.current &&
        !disabledRef.current &&
        voiceEnabledRef.current
      ) {
        void beginRef.current("always");
      }
    }, 0);
  }

  /** Invalidates permission, recording, and fetch work without applying stale audio. */
  function invalidateCapture(restart: boolean, afterStop: (() => void) | null = null) {
    requestGeneration.current += 1;
    transcription.current?.abort();
    transcription.current = null;
    clearPermissionTimer();
    clearCycle();
    discard.current = true;
    restartAfterStop.current = restart;
    afterCaptureStop.current = afterStop;
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    cleanupRecorder();
    restartAfterStop.current = false;
    afterCaptureStop.current = null;
    if (afterStop) afterStop();
    else if (restart) scheduleAlwaysRestart();
  }
  invalidateCaptureRef.current = invalidateCapture;

  function clearCycle() {
    if (cycleTimer.current !== null) {
      window.clearTimeout(cycleTimer.current);
      cycleTimer.current = null;
    }
  }
  function clearPermissionTimer() {
    if (permissionTimer.current !== null) {
      window.clearTimeout(permissionTimer.current);
      permissionTimer.current = null;
    }
  }
  function stopStream() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  function stopMonitor() {
    if (monitorFrame.current !== null) window.cancelAnimationFrame(monitorFrame.current);
    monitorFrame.current = null;
    void audio.current?.close().catch(() => undefined);
    audio.current = null;
    segmenter.current = createSegmenter();
  }

  /**
   * Watches how loud the room is and decides where a clip begins and ends.
   *
   * Runs on animation frames rather than a timer so it stops when the tab is
   * hidden — a phone on a stool with the screen off should not be holding a
   * microphone open and sending audio.
   */
  function startMonitor(
    media: MediaStream,
    request: VoiceRequest,
    startCapture: () => void,
  ): boolean {
    stopMonitor();
    try {
      const context = new AudioContext();
      audio.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(media).connect(analyser);
      const frame = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (
          !isRequestCurrent(request) ||
          stream.current !== media
        )
          return;
        analyser.getFloatTimeDomainData(frame);
        const step = observeLevel(segmenter.current, frameLevel(frame), context.currentTime * 1000);
        segmenter.current = step.state;
        if (step.event.kind === "speech-started") startCapture();
        if (step.event.kind === "clip") { stop(false); return; }
        // Too short to be a score: drop it and keep listening without a word.
        if (step.event.kind === "discarded") { stop(true); return; }
        monitorFrame.current = window.requestAnimationFrame(tick);
      };
      monitorFrame.current = window.requestAnimationFrame(tick);
      return true;
    } catch {
      return false;
    }
  }

  function cleanupRecorder() {
    clearCycle();
    stopMonitor();
    stopStream();
    recorder.current = null;
  }

  async function begin(mode: "push" | "always") {
    if (
      disabledRef.current ||
      !voiceEnabledRef.current ||
      phaseRef.current === "requesting" ||
      phaseRef.current === "processing" ||
      recorder.current?.state === "recording"
    )
      return;
    const request: VoiceRequest = {
      id: ++requestGeneration.current,
      revision: revisionRef.current,
    };
    setError(null);
    if (mode === "push") setResult(null);
    discard.current = false;
    restartAfterStop.current = false;
    afterCaptureStop.current = null;
    changePhase("requesting");
    clearPermissionTimer();
    permissionTimer.current = window.setTimeout(() => {
      if (!isRequestCurrent(request)) return;
      requestGeneration.current += 1;
      permissionTimer.current = null;
      holdActive.current = false;
      setAlwaysOn(false);
      alwaysRef.current = false;
      setError(
        "The browser did not finish the microphone permission request. Close the browser prompt or update this site’s microphone permission, then try again.",
      );
      changePhase("error");
    }, 12000);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!isRequestCurrent(request)) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      if (mode === "push" && !holdActive.current) {
        requestGeneration.current += 1;
        clearPermissionTimer();
        media.getTracks().forEach((track) => track.stop());
        changePhase(pending(dialogueRef.current).length > 0 ? "confirm" : "idle");
        return;
      }
      clearPermissionTimer();
      stream.current = media;
      chunks.current = [];
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (value) => MediaRecorder.isTypeSupported(value),
      );
      const next = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onerror = () => {
        if (!isRequestCurrent(request)) return;
        requestGeneration.current += 1;
        discard.current = true;
        next.onstop = null;
        next.ondataavailable = null;
        next.onerror = null;
        cleanupRecorder();
        alwaysRef.current = false;
        setAlwaysOn(false);
        setError("The browser recorder stopped unexpectedly.");
        changePhase("error");
      };
      next.onstop = () =>
        void finishRecording(next.mimeType || "audio/webm", request, mode);
      const startCapture = () => {
        if (
          !isRequestCurrent(request) ||
          recorder.current !== next ||
          next.state !== "inactive"
        )
          return;
        chunks.current = [];
        next.start(250);
        // The wall-clock ceiling begins with speech, never with idle listening.
        // It remains independent of animation frames, which pause in hidden tabs.
        cycleTimer.current = window.setTimeout(() => {
          if (isRequestCurrent(request) && recorder.current === next)
            stop(false);
        }, 9000);
      };
      // A clip is a sentence, not a stopwatch: the segmenter closes it when the
      // room goes quiet, and throws away anything too short to be a score — which
      // is mostly darts hitting the board.
      if (mode === "always") {
        changePhase("listening");
        if (!startMonitor(media, request, startCapture)) {
          cleanupRecorder();
          alwaysRef.current = false;
          setAlwaysOn(false);
          setError(
            "This browser cannot detect speech for hands-free listening. Hold to speak instead.",
          );
          changePhase("error");
        }
      } else {
        startCapture();
        changePhase("recording");
      }
    } catch (problem) {
      if (!isRequestCurrent(request)) return;
      clearPermissionTimer();
      cleanupRecorder();
      const denied =
        problem instanceof DOMException &&
        (problem.name === "NotAllowedError" ||
          problem.name === "SecurityError");
      setError(
        denied
          ? "Microphone permission was denied. Allow microphone access in this site’s browser settings, then try again."
          : "No usable microphone was found on this device.",
      );
      changePhase(denied ? "denied" : "error");
      alwaysRef.current = false;
      setAlwaysOn(false);
    }
  }
  beginRef.current = begin;

  function stop(shouldDiscard: boolean) {
    clearCycle();
    discard.current = shouldDiscard;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  /** A release owns the permission request too, not only an existing recorder. */
  function releasePush(shouldDiscard: boolean) {
    if (!holdActive.current) return;
    holdActive.current = false;
    if (phaseRef.current === "requesting") {
      invalidateCapture(false);
      setError(null);
      changePhase(pending(dialogueRef.current).length > 0 ? "confirm" : "idle");
      return;
    }
    stop(shouldDiscard);
  }
  async function finishRecording(
    mime: string,
    request: VoiceRequest,
    captureMode: "push" | "always",
  ) {
    const ignored = discard.current,
      blob = new Blob(chunks.current, { type: mime });
    cleanupRecorder();
    chunks.current = [];
    const continuation = afterCaptureStop.current;
    const restart = restartAfterStop.current;
    afterCaptureStop.current = null;
    restartAfterStop.current = false;
    if (!isRequestCurrent(request)) {
      const contextIsCurrent = isRequestContextCurrent(request);
      if (
        requestGeneration.current !== request.id &&
        contextIsCurrent &&
        continuation
      )
        continuation();
      else if (
        requestGeneration.current !== request.id &&
        contextIsCurrent &&
        restart
      )
        scheduleAlwaysRestart();
      return;
    }
    if (ignored) {
      // A cough, a chair, a dart in the board. Always-on goes back to listening
      // without saying anything — stopping to be restarted after every noise in
      // the room is exactly what made the old mode unusable.
      if (alwaysRef.current) scheduleAlwaysRestart();
      else changePhase("idle");
      return;
    }
    if (!blob.size) {
      setError(
        "No speech was captured. Hold the control until you finish speaking.",
      );
      alwaysRef.current = false;
      setAlwaysOn(false);
      changePhase("error");
      return;
    }
    changePhase("processing");
    const controller = new AbortController();
    transcription.current = controller;
    try {
      const form = new FormData();
      form.append(
        "audio",
        blob,
        `dartio-voice.${mime.includes("mp4") ? "m4a" : "webm"}`,
      );
      form.append("language", "en");
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!isRequestCurrent(request)) return;
      if (!response.ok) {
        if ([401, 402, 403, 503].includes(response.status)) void access.refresh();
        throw new Error(response.status === 401?"Sign in to use cloud voice scoring.":response.status===402||response.status===403?"Voice scoring requires active Pro access.":response.status===503?"Voice access could not be verified. Try again shortly.":payloadError(payload)||"Transcription failed");
      }
      const next = parseVoiceTranscription(payload);
      if (!next) throw new Error("Transcription returned an invalid response.");
      if (!isRequestCurrent(request)) return;
      routeTranscription(next, captureMode, request);
    } catch (problem) {
      if (
        controller.signal.aborted ||
        !isRequestCurrent(request)
      )
        return;
      alwaysRef.current = false;
      setAlwaysOn(false);
      setError(
        problem instanceof Error ? problem.message : "Transcription failed",
      );
      changePhase("error");
    } finally {
      if (transcription.current === controller) transcription.current = null;
    }
  }

  /** Routes one server-parsed command through the FIFO confidence policy. */
  function routeTranscription(
    next: VoiceTranscription,
    source: "push" | "always" | "ui",
    request: VoiceRequest | null = null,
  ) {
    if (request && !isRequestCurrent(request)) return;
    const outcome = hearCommand(
      dialogueRef.current,
      next.transcript,
      next.command,
      mode,
      { confidence: next.confidence, forceReview: source === "push" },
    );
    storeDialogue(outcome.state);

    if (outcome.kind === "apply" || outcome.kind === "confirmed") {
      // An external score can commit after fetch resolution but before this
      // branch. The render refs close that pre-effect window at the last moment.
      if (request && !isRequestCurrent(request)) return;
      setResult(null);
      if (!applyCommand(outcome.command, next.transcript)) return;
      changePhase(alwaysRef.current ? "paused" : "idle");
      if (alwaysRef.current) scheduleAlwaysRestart();
      return;
    }
    if (outcome.kind === "queued") {
      setResult(null);
      changePhase("confirm");
      if (alwaysRef.current) scheduleAlwaysRestart();
      return;
    }
    if (outcome.kind === "cancelled") {
      setResult(null);
      setError(null);
      changePhase(
        pending(outcome.state).length > 0
          ? "confirm"
          : alwaysRef.current
            ? "paused"
            : "idle",
      );
      if (alwaysRef.current) scheduleAlwaysRestart();
      return;
    }

    setResult({
      transcript: next.transcript,
      command:
        outcome.kind === "out-of-vocabulary" ||
        outcome.kind === "uncertain-control"
          ? outcome.command
          : next.command,
      confidence: next.confidence,
      reason: outcome.kind,
    });
    changePhase("ambiguous");
    if (alwaysRef.current) scheduleAlwaysRestart();
  }

  /**
   * Applies a command directly rather than reading it back out of state.
   *
   * Always-on has to apply the visit it just heard and immediately start listening
   * again; reading `result` would see the value from before this render.
   */
  function applyCommand(command: VoiceCommand, transcript: string): boolean {
    if (command.type === "dart") onDart(command.segment, command.multiplier);
    else if (command.type === "turn_score") onTurnScore(command.score);
    else if (command.type === "undo") onUndo();
    else if (command.type === "next_player") onNextPlayer();
    else {
      setError(`“${transcript}” is a voice-control word, not a score to apply here.`);
      changePhase("ambiguous");
      return false;
    }
    return true;
  }

  function resolveHeld(type: "confirm" | "cancel") {
    const resolve = () =>
      routeTranscription(
        {
          transcript: type,
          command: { type },
          confidence: 1,
        },
        "ui",
      );
    invalidateCapture(false, resolve);
  }
  function cancelPermissionRequest() {
    alwaysRef.current = false;
    setAlwaysOn(false);
    invalidateCapture(false);
    setError(null);
    changePhase(pending(dialogueRef.current).length > 0 ? "confirm" : "idle");
  }
  function toggleAlways() {
    if (
      phaseRef.current === "requesting" ||
      phaseRef.current === "recording" ||
      phaseRef.current === "processing"
    ) {
      cancelPermissionRequest();
      return;
    }
    if (alwaysRef.current) {
      alwaysRef.current = false;
      setAlwaysOn(false);
      invalidateCapture(false);
      changePhase(pending(dialogueRef.current).length > 0 ? "confirm" : "idle");
    } else {
      alwaysRef.current = true;
      setAlwaysOn(true);
      void begin("always");
    }
  }
  function resume() {
    void begin("always");
  }
  const held = pending(dialogue);
  const oldest = held[0];
  const label = phaseLabel(phase, held.length);
  const stopping =
    phase === "requesting" || phase === "recording" || phase === "processing";
  return (
    <Surface
      className={`voice-console voice-${phase}`}
      aria-label="Voice score input"
    >
      <header>
        <div>
          <span className="voice-kicker">VOICE INPUT</span>
          <h3>{label.title}</h3>
        </div>
        <span className="voice-state">
          <i />
          {label.state}
        </span>
      </header>
      <p className="voice-guidance">{label.guidance}</p>
      <div className="voice-wave" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="voice-controls">
        {phase === "paused" && alwaysOn ? (
          <Button onClick={resume} disabled={disabled}>
            Listen again
          </Button>
        ) : (
          <button
            type="button"
            className="voice-hold"
            disabled={
              disabled ||
              alwaysOn ||
              phase === "processing" ||
              phase === "requesting"
            }
            aria-label="Hold to record a voice score"
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" || event.pointerType === "pen") {
                holdActive.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                void begin("push");
              }
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "mouse" || event.pointerType === "pen")
                releasePush(false);
            }}
            onPointerCancel={() => releasePush(true)}
            onLostPointerCapture={() => {
              if (!holdActive.current) return;
              holdActive.current = false;
              stop(true);
            }}
            onTouchStart={() => {
              holdActive.current = true;
              void begin("push");
            }}
            onTouchEnd={() => releasePush(false)}
            onTouchCancel={() => releasePush(true)}
            onKeyDown={(event) => {
              if (
                (event.key === " " || event.key === "Enter") &&
                !event.repeat
              ) {
                event.preventDefault();
                holdActive.current = true;
                void begin("push");
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                releasePush(false);
              }
            }}
            onBlur={() => {
              releasePush(true);
            }}
          >
            <span className="mic"><RecordDotIcon /></span>
            <b>
              {phase === "recording" ? "Release to process" : "Hold to speak"}
            </b>
          </button>
        )}
        <button
          type="button"
          className={`always-toggle ${alwaysOn ? "active" : ""}`}
          aria-label={
            stopping
              ? "Stop voice capture and processing"
              : alwaysOn
                ? "Stop continuous hands-free listening"
                : "Start continuous hands-free listening"
          }
          aria-pressed={alwaysOn}
          onClick={toggleAlways}
          disabled={disabled}
        >
          <span>{stopping ? "Stop" : alwaysOn ? "Stop listening" : "Hands-free"}</span>
          <i>{stopping ? "CANCEL" : alwaysOn ? "ACTIVE" : "9 SEC MAX"}</i>
        </button>
      </div>
      {oldest && (
        <div className="voice-result ambiguous held">
          <span>
            HELD FOR REVIEW · 1 OF {held.length}
          </span>
          <blockquote>“{oldest.text}”</blockquote>
          <p>
            Parsed as <strong>{describeCommand(oldest.command)}</strong> ·{" "}
            {Math.round(oldest.confidence * 100)}% confidence. {oldest.reason === "forced-review"
              ? "Push-to-talk always waits for your explicit confirmation."
              : oldest.reason === "confidence"
                ? "Dartio is not confident enough to change the match."
                : "This waits behind an earlier held command so nothing applies out of order."}
          </p>
          <div>
            <Button onClick={() => resolveHeld("confirm")}>
              Confirm oldest
            </Button>
            <Button variant="secondary" onClick={() => resolveHeld("cancel")}>
              Discard oldest
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div
          className="voice-result ambiguous"
        >
          <span>TRANSCRIPT</span>
          <blockquote>
            “{result.transcript || "No speech recognized"}”
          </blockquote>
          <p>{describeResult(result)}</p>
        </div>
      )}
      {error && (
        <div className="voice-error" role="alert">
          <b>
            {phase === "denied" ? "Microphone blocked" : "Voice input paused"}
          </b>
          <p>{error}</p>
          <button
            onClick={() => {
              setError(null);
              changePhase(alwaysOn ? "paused" : "idle");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <p className="voice-privacy">
        <span>PRIVATE BY DEFAULT</span> Audio is recorded only while you hold the
        control, or after hands-free listening detects that speech began.
        Speech-aware clips stop when you finish talking and are capped at 9
        seconds. Clips are sent through Dartio to OpenAI for transcription and
        limited to 10 MB.
        Push-to-talk always waits for review. Clear hands-free commands apply
        immediately; uncertain commands wait for confirmation or dismissal,
        oldest first.
      </p>
      <div className="voice-live" role="status" aria-live="polite">
        {label.announcement}
      </div>
    </Surface>
  );
}

function describeCommand(command: VoiceCommand) {
  if (command.type === "dart")
    return `${command.multiplier === 3 ? "treble " : command.multiplier === 2 ? "double " : "single "}${command.segment === 25 ? "bull" : command.segment}`;
  if (command.type === "turn_score") return `turn score ${command.score}`;
  if (command.type === "next_player") return "end visit / next player";
  return command.type;
}

function describeResult(result: VoiceResult) {
  if (result.reason === "uncertain-control")
    return "That confirmation was also uncertain. Say it again clearly, or use the buttons on the held score.";
  if (result.reason === "nothing-pending")
    return "Nothing is waiting for confirmation. Say a score or dart first.";
  if (result.reason === "out-of-vocabulary" && result.command)
    return `Parsed as ${describeCommand(result.command)}, but that command does not belong in this match mode.`;
  return "I couldn’t map that safely. Try “score sixty”, “treble twenty”, “undo”, or “next player”.";
}

/** Accepts only the server contract; malformed success payloads never touch a match. */
function parseVoiceTranscription(value: unknown): VoiceTranscription | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.transcript !== "string" ||
    typeof payload.confidence !== "number" ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 ||
    payload.confidence > 1
  )
    return null;
  if (payload.command === null)
    return {
      transcript: payload.transcript.trim(),
      command: null,
      confidence: payload.confidence,
    };
  const command = voiceCommandSchema.safeParse(payload.command);
  if (!command.success) return null;
  return {
    transcript: payload.transcript.trim(),
    command: command.data,
    confidence: payload.confidence,
  };
}

function payloadError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : null;
}

function phaseLabel(phase: VoicePhase, pendingCount: number) {
  switch (phase) {
    case "requesting":
      return {
        title: "Opening the mic",
        state: "REQUESTING",
        guidance: "Waiting for browser permission…",
        announcement: "Requesting microphone access.",
      };
    case "recording":
      return {
        title: "Speak your score",
        state: "RECORDING",
        guidance: "Keep holding. Release when the phrase is complete.",
        announcement: "Recording. Release to process.",
      };
    case "listening":
      return {
        title: pendingCount > 0 ? "Listening for your decision" : "Listening continuously",
        state: "LISTENING",
        guidance:
          pendingCount > 0
            ? "Say confirm or cancel for the oldest held command. Each clip ends with your speech and is capped at 9 seconds."
            : "Speak one command. Each clip ends with your speech, is capped at 9 seconds, then listening resumes.",
        announcement:
          pendingCount > 0
            ? "Listening for confirmation of the oldest held command."
            : "Continuous voice listening is active.",
      };
    case "paused":
      return {
        title: "Listening is paused",
        state: "PAUSED",
        guidance:
          "The last clip has stopped. Choose Listen again when you are ready for another command.",
        announcement: "Voice clip has stopped.",
      };
    case "processing":
      return {
        title: "Reading the throw",
        state: "PROCESSING",
        guidance: "Transcribing and checking for one unambiguous command…",
        announcement: "Processing voice input.",
      };
    case "confirm":
      return {
        title: "A command is held",
        state: "REVIEW",
        guidance:
          "Nothing changes until you confirm or discard the oldest held command.",
        announcement: `${pendingCount} voice ${pendingCount === 1 ? "command is" : "commands are"} waiting for review.`,
      };
    case "ambiguous":
      return {
        title: "That needs another pass",
        state: "AMBIGUOUS",
        guidance:
          "The transcript is visible, but no safe score will be guessed.",
        announcement: "Voice command was ambiguous.",
      };
    case "denied":
      return {
        title: "Microphone permission needed",
        state: "BLOCKED",
        guidance:
          "Your match is untouched. Update browser permission to continue.",
        announcement: "Microphone permission denied.",
      };
    case "error":
      return {
        title: "Voice input paused",
        state: "ERROR",
        guidance: "Your match is untouched. Dismiss the message and try again.",
        announcement: "Voice input encountered an error.",
      };
    default:
      return {
        title: "Score without breaking stance",
        state: "READY",
        guidance:
          "Hold to speak and review one command, or start continuous hands-free listening. Clear hands-free commands apply immediately.",
        announcement: "Voice input is ready.",
      };
  }
}
