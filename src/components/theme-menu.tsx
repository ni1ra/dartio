"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useNaviTheme, type ThemeName } from "navi-ui";
import { CheckIcon } from "./icons";

/**
 * The theme control, as one icon rather than a row of names.
 *
 * Navi's `ThemeSwitcher` lays all three themes out inline, which spends the
 * widest part of the navigation on a control most players touch once. This
 * collapses it to a single swatch that opens a vertical menu — the theme in use
 * is legible at a glance from the swatch colour, and the names only appear when
 * someone is actually choosing.
 *
 * Built as a menu rather than a `<select>` so each option can carry its own
 * colour, and wired for the keyboard the way a menu is expected to behave:
 * arrows move, Home and End jump, Escape closes and returns focus to the
 * trigger, and a click outside dismisses.
 */
const THEMES: readonly { readonly id: ThemeName; readonly label: string; readonly note: string }[] = [
  { id: "black", label: "Black", note: "Deep black, orange accent" },
  { id: "silver", label: "Silver", note: "Bright silver, daylight" },
  { id: "blood", label: "Blood", note: "Blood red, low light" },
];

export function ThemeMenu() {
  const { theme, setTheme } = useNaviTheme();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const current = THEMES.find((entry) => entry.id === theme) ?? THEMES[0]!;

  function openAt(index: number) {
    setActive(index);
    setOpen(true);
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function choose(id: ThemeName) {
    setTheme(id);
    close();
  }

  // Focus follows the active option while the menu is open, so keyboard and
  // pointer users are never looking at a different item than the one that acts.
  useEffect(() => {
    if (!open) return;
    options.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index + 1) % THEMES.length);
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index - 1 + THEMES.length) % THEMES.length);
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(THEMES.length - 1);
        return;
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tabbing away is a dismissal, but the focus move is the browser's.
        setOpen(false);
        return;
      default:
    }
  }

  return (
    <div className="theme-menu" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="theme-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Theme: ${current.label}. Change theme`}
        onClick={() => (open ? close(false) : openAt(THEMES.findIndex((entry) => entry.id === theme)))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openAt(event.key === "ArrowDown" ? 0 : THEMES.length - 1);
        }}
      >
        <span className={`theme-swatch theme-swatch--${current.id}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="theme-menu__list" id={menuId} role="menu" aria-label="Theme" onKeyDown={onMenuKeyDown}>
          {THEMES.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="menuitemradio"
              aria-checked={entry.id === theme}
              tabIndex={index === active ? 0 : -1}
              ref={(node) => { options.current[index] = node; }}
              className="theme-menu__option"
              onClick={() => choose(entry.id)}
              onMouseEnter={() => setActive(index)}
            >
              <span className={`theme-swatch theme-swatch--${entry.id}`} aria-hidden="true" />
              <span className="theme-menu__text">
                <b>{entry.label}</b>
                <small>{entry.note}</small>
              </span>
              <span className="theme-menu__check" aria-hidden="true">{entry.id === theme ? <CheckIcon /> : null}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
