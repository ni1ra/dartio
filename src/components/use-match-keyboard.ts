"use client";

import { useCallback, useEffect, useState } from "react";
import { dart, type BoardNumber, type Dart, type Multiplier } from "@/domain";

export interface MatchKeyboardHandlers {
  readonly onDart: (value: Dart) => void;
  readonly onUndo: () => void;
  readonly disabled?: boolean;
}

export interface MatchKeyboardState {
  /** The digits typed so far, or an empty string. Shown so the player can see it. */
  readonly pending: string;
  /** Human-readable description of the last thing the keyboard did. */
  readonly announcement: string;
}

const MULTIPLIER_WORD: Record<Multiplier, string> = { 1: "Single", 2: "Double", 3: "Treble" };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

/**
 * Keyboard scoring for a whole leg without reaching for the pointer.
 *
 * Tabbing to one of sixty-three buttons per dart is technically accessible and
 * practically unusable, so scoring gets a real keyboard scheme: type the
 * number, then choose the bed.
 *
 *   1–9, 0   build the segment (`2` then `0` is twenty)
 *   Enter    single    d  double    t  treble
 *   b        bull      B  double bull      m  miss
 *   Backspace  undo the last entry      Escape  clear what is typed
 *
 * The handler stays off form fields, so typing a room code or an email is never
 * captured as a dart.
 */
export function useMatchKeyboard({ onDart, onUndo, disabled = false }: MatchKeyboardHandlers): MatchKeyboardState {
  const [pending, setPending] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const record = useCallback((segment: BoardNumber | 0, multiplier: Multiplier) => {
    onDart(dart(segment, multiplier));
    setPending("");
    setAnnouncement(
      segment === 0
        ? "Miss recorded"
        : `${MULTIPLIER_WORD[multiplier]} ${segment === 25 ? "bull" : segment} recorded`,
    );
  }, [onDart]);

  useEffect(() => {
    if (disabled) return;

    function handle(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        // Two digits is the whole board; a third would only ever be a typo.
        setPending((current) => (current.length >= 2 ? event.key : current + event.key));
        return;
      }

      const segment = Number(pending);
      const scored = pending !== "" && segment >= 0 && segment <= 20;

      switch (event.key) {
        case "Enter":
          if (!scored) return;
          event.preventDefault();
          record(segment as BoardNumber | 0, 1);
          return;
        case "d":
        case "D":
          if (!scored || segment === 0) return;
          event.preventDefault();
          record(segment as BoardNumber, 2);
          return;
        case "t":
        case "T":
          if (!scored || segment === 0) return;
          event.preventDefault();
          record(segment as BoardNumber, 3);
          return;
        case "b":
          event.preventDefault();
          record(25, 1);
          return;
        case "B":
          event.preventDefault();
          record(25, 2);
          return;
        case "m":
        case "M":
          event.preventDefault();
          record(0, 1);
          return;
        case "Backspace":
          event.preventDefault();
          if (pending !== "") {
            setPending((current) => current.slice(0, -1));
            return;
          }
          onUndo();
          setAnnouncement("Last entry undone");
          return;
        case "Escape":
          if (pending === "") return;
          event.preventDefault();
          setPending("");
          setAnnouncement("Cleared");
          return;
        default:
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [disabled, pending, record, onUndo]);

  /*
   * A disabled surface must not keep half-typed input around for when it
   * re-enables, or the opponent's visit inherits it. Adjusted during render
   * rather than in an effect: React re-runs this component before committing,
   * so the stale digits never reach the DOM.
   */
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled && pending !== "") setPending("");
  }

  return { pending: disabled ? "" : pending, announcement };
}
