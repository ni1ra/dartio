import type { SVGProps } from "react";

/**
 * Dartio's icon family. Hand-authored inline SVG — no icon dependency — so the
 * set stays one visual voice: a 24×24 grid, 2px rounded strokes, and
 * `currentColor` throughout so every icon inherits the token colour of
 * wherever it sits (this is what keeps them white on the accent-orange
 * brand mark and avatar, and correct across all three themes).
 *
 * Icons default to `1em` square so they scale with the surrounding font-size,
 * which is how every existing site sizes its glyph. All are `aria-hidden` by
 * default — each sits beside text that already carries the meaning — and the
 * spread comes last so a caller can override when an icon must speak.
 */
type IconProps = SVGProps<SVGSVGElement>;

/** Shared frame that enforces the family: grid, stroke, sizing, a11y. */
function Icon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : "icon"}
      {...props}
    >
      {children}
    </svg>
  );
}

/**
 * Dartboard bullseye — the brand mark. Also the empty state for visit
 * history: no darts have hit the board yet.
 */
export function TargetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Guest silhouette — placeholder identity for the signed-out avatar. */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20c.7-3.9 3.5-6 7-6s6.3 2.1 7 6" />
    </Icon>
  );
}

/** Launch — "go there now", on the primary play call to action. */
export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Icon>
  );
}

/** Forward — "continues here", on list rows that lead somewhere. */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h16" />
      <path d="m13 5 7 7-7 7" />
    </Icon>
  );
}

/** Confirmation — a selected option or a completed step. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </Icon>
  );
}

/**
 * Recording dot for the push-to-talk mic. Filled rather than stroked — a
 * record indicator is a solid dot by convention, and at the 10px size it
 * renders at, a stroked circle would collapse into a smudge.
 */
export function RecordDotIcon(props: IconProps) {
  return (
    <Icon stroke="none" {...props}>
      <circle cx="12" cy="12" r="7" fill="currentColor" />
    </Icon>
  );
}
