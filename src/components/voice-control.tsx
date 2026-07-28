"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Surface } from "navi-ui";
import type { VoiceCommand } from "@/lib/voice/commands";
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
type VoiceResult = { transcript: string; command: VoiceCommand | null };
type VoiceControlProps = {
  disabled?: boolean;
  onDart: (segment: number, multiplier: 1 | 2 | 3) => void;
  onTurnScore: (score: number) => void;
  onUndo: () => void;
  onNextPlayer: () => void;
};

export function VoiceControl({
  disabled = false,
  onDart,
  onTurnScore,
  onUndo,
  onNextPlayer,
}: VoiceControlProps) {
  const access = useAccess();
  const [phase, setPhase] = useState<VoicePhase>("idle"),
    [alwaysOn, setAlwaysOn] = useState(false),
    [result, setResult] = useState<VoiceResult | null>(null),
    [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    cycleTimer = useRef<number | null>(null),
    permissionTimer = useRef<number | null>(null),
    requestGeneration = useRef(0),
    holdActive = useRef(false),
    discard = useRef(false),
    alive = useRef(true),
    alwaysRef = useRef(false);
  useEffect(() => {
    alwaysRef.current = alwaysOn;
  }, [alwaysOn]);
  useEffect(
    () => () => {
      alive.current = false;
      requestGeneration.current += 1;
      clearPermissionTimer();
      clearCycle();
      recorder.current?.stop();
      stopStream();
    },
    [],
  );

  const voiceEnabled = access.status === "ready" && isProductAvailable(access.snapshot, "voiceInput") && hasAccessEntitlement(access.snapshot, "voice_always_on");
  if (!voiceEnabled) {
    const loading = access.status === "loading";
    const unavailable = access.status === "unavailable";
    const anonymous = access.status === "ready" && access.snapshot.auth === "anonymous";
    return <Surface className={`voice-console voice-access ${unavailable?"unavailable":"locked"}`} aria-busy={loading||undefined} aria-label="Voice score input access"><header><div><span className="voice-kicker">VOICE INPUT</span><h3>{loading?"Checking voice access":unavailable?"Voice access unavailable":"Voice scoring is a Pro feature"}</h3></div><span className="voice-state"><i />{loading?"CHECKING":unavailable?"UNAVAILABLE":"LOCKED"}</span></header><p className="voice-guidance">{loading?"Local scoring stays ready while Dartio checks this feature.":unavailable?"Dartio could not verify paid access. Your match and manual scoring are unaffected.":"Pro includes push-to-talk voice scoring."}</p><div className="voice-access-actions">{unavailable?<Button variant="secondary" onClick={()=>void access.retry()}>Retry access</Button>:anonymous?<><Link className="button-link" href="/auth/sign-in">Sign in</Link><Link className="button-link button-link-secondary" href="/pricing">View Pro</Link></>:!loading?<Link className="button-link" href="/pricing">Upgrade to Pro</Link>:null}</div></Surface>;
  }

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
  function cleanupRecorder() {
    clearCycle();
    stopStream();
    recorder.current = null;
  }

  async function begin(mode: "push" | "always") {
    if (
      disabled ||
      phase === "requesting" ||
      phase === "processing" ||
      recorder.current?.state === "recording"
    )
      return;
    const requestId = ++requestGeneration.current;
    setError(null);
    setResult(null);
    discard.current = false;
    setPhase("requesting");
    clearPermissionTimer();
    permissionTimer.current = window.setTimeout(() => {
      if (requestGeneration.current !== requestId) return;
      requestGeneration.current += 1;
      permissionTimer.current = null;
      setAlwaysOn(false);
      alwaysRef.current = false;
      setError(
        "The browser did not finish the microphone permission request. Close the browser prompt or update this site’s microphone permission, then try again.",
      );
      setPhase("error");
    }, 12000);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!alive.current || requestGeneration.current !== requestId) {
        media.getTracks().forEach((track) => track.stop());
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
        cleanupRecorder();
        setError("The browser recorder stopped unexpectedly.");
        setPhase("error");
      };
      next.onstop = () => void finishRecording(next.mimeType || "audio/webm");
      next.start(250);
      setPhase(mode === "always" ? "listening" : "recording");
      if (mode === "always")
        cycleTimer.current = window.setTimeout(() => stop(false), 4500);
      if (mode === "push" && !holdActive.current)
        window.setTimeout(() => stop(false), 120);
    } catch (problem) {
      if (requestGeneration.current !== requestId) return;
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
      setPhase(denied ? "denied" : "error");
      setAlwaysOn(false);
    }
  }

  function stop(shouldDiscard: boolean) {
    clearCycle();
    discard.current = shouldDiscard;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  async function finishRecording(mime: string) {
    const ignored = discard.current,
      blob = new Blob(chunks.current, { type: mime });
    cleanupRecorder();
    chunks.current = [];
    if (ignored) {
      if (alive.current) setPhase(alwaysRef.current ? "paused" : "idle");
      return;
    }
    if (!blob.size) {
      setError(
        "No speech was captured. Hold the control until you finish speaking.",
      );
      setPhase("error");
      return;
    }
    setPhase("processing");
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
      });
      const payload = (await response.json()) as {
        transcript?: string;
        command?: VoiceCommand | null;
        error?: string;
      };
      if (!response.ok) {
        if ([401, 402, 403, 503].includes(response.status)) void access.refresh();
        throw new Error(response.status === 401?"Sign in to use cloud voice scoring.":response.status===402||response.status===403?"Voice scoring requires active Pro access.":response.status===503?"Voice access could not be verified. Try again shortly.":payload.error||"Transcription failed");
      }
      const next = {
        transcript: payload.transcript?.trim() || "",
        command: payload.command ?? null,
      };
      setResult(next);
      setPhase(next.command ? "confirm" : "ambiguous");
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Transcription failed",
      );
      setPhase("error");
    }
  }

  function apply() {
    const command = result?.command;
    if (!command) return;
    if (command.type === "dart") onDart(command.segment, command.multiplier);
    else if (command.type === "turn_score") onTurnScore(command.score);
    else if (command.type === "undo") onUndo();
    else if (command.type === "next_player") onNextPlayer();
    else {
      setError(
        `“${result?.transcript}” is a voice-control word, not a score to apply here.`,
      );
      setPhase("ambiguous");
      return;
    }
    setResult(null);
    setPhase(alwaysOn ? "paused" : "idle");
  }
  function cancel() {
    setResult(null);
    setError(null);
    setPhase(alwaysOn ? "paused" : "idle");
  }
  function cancelPermissionRequest() {
    requestGeneration.current += 1;
    clearPermissionTimer();
    setAlwaysOn(false);
    alwaysRef.current = false;
    setError(null);
    setPhase("idle");
  }
  function toggleAlways() {
    if (phase === "requesting") {
      cancelPermissionRequest();
      return;
    }
    if (alwaysOn) {
      setAlwaysOn(false);
      alwaysRef.current = false;
      stop(true);
      setPhase("idle");
    } else {
      setAlwaysOn(true);
      alwaysRef.current = true;
      void begin("always");
    }
  }
  function resume() {
    void begin("always");
  }
  const label = phaseLabel(phase);
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
              if (event.pointerType === "mouse") {
                holdActive.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                void begin("push");
              }
            }}
            onPointerUp={(event) => {
              if (event.pointerType === "mouse") {
                holdActive.current = false;
                stop(false);
              }
            }}
            onTouchStart={() => {
              holdActive.current = true;
              void begin("push");
            }}
            onTouchEnd={() => {
              holdActive.current = false;
              stop(false);
            }}
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
                holdActive.current = false;
                stop(false);
              }
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
          aria-label={alwaysOn ? "End hands-free clip mode" : "Listen for one voice clip"}
          onClick={toggleAlways}
          disabled={disabled || phase === "processing"}
        >
          <span>{phase === "requesting" ? "Cancel mic" : alwaysOn ? "End clip mode" : "Listen once"}</span>
          <i>{phase === "requesting" ? "CANCEL" : alwaysOn ? "ACTIVE" : "4.5 SEC"}</i>
        </button>
      </div>
      {result && (
        <div
          className={`voice-result ${phase === "ambiguous" ? "ambiguous" : ""}`}
        >
          <span>TRANSCRIPT</span>
          <blockquote>
            “{result.transcript || "No speech recognized"}”
          </blockquote>
          {result.command ? (
            <p>
              Parsed as <strong>{describeCommand(result.command)}</strong>
            </p>
          ) : (
            <p>
              I couldn’t map that safely. Try “score sixty”, “treble twenty”,
              “undo”, or “next player”.
            </p>
          )}
          <div>
            <Button onClick={apply} disabled={!result.command}>
              Apply to match
            </Button>
            <Button variant="secondary" onClick={cancel}>
              Discard
            </Button>
          </div>
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
              setPhase(alwaysOn ? "paused" : "idle");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <p className="voice-privacy">
        <span>PRIVATE BY DEFAULT</span> Audio is recorded only after you hold
        the control or choose Listen once. A hands-free clip stops after 4.5
        seconds. Clips are sent to Dartio for transcription, are limited to 10
        MB, and are never applied to the match without confirmation.
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
function phaseLabel(phase: VoicePhase) {
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
        title: "Listening for one command",
        state: "LISTENING",
        guidance:
          "Speak one command. This clip stops after 4.5 seconds, then waits for confirmation.",
        announcement: "One voice clip is recording.",
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
        title: "Confirm before scoring",
        state: "REVIEW",
        guidance: "Nothing changes until you apply the parsed command below.",
        announcement: "Voice command ready for confirmation.",
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
          "Hold to speak, or choose Listen once for a 4.5-second hands-free clip. Every result waits for confirmation.",
        announcement: "Voice input is ready.",
      };
  }
}
