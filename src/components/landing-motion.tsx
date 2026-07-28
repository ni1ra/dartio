"use client";

import { useEffect } from "react";

/**
 * Motion controller for the landing page. Renders nothing.
 *
 * Everything it enables is gated behind `html[data-lp-motion]`, which this
 * component sets only when the visitor has not asked for reduced motion. That
 * split carries two guarantees: with JavaScript disabled or motion reduced,
 * no element ever starts hidden, and the page reads as a plain static layout;
 * with motion on, sections start translated/transparent and the observer
 * flips them in as they enter the viewport.
 *
 * The IntersectionObserver is the fallback path for scroll reveals — the
 * pure-CSS `animation-timeline: view()` parallax pieces live entirely in
 * match-layout.css behind @supports and need no JS at all.
 */
export function LandingMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const root = document.documentElement;
    root.dataset.lpMotion = "on";

    // Scroll reveals: one-shot per element. Unobserving after the flip keeps
    // the observer's exit condition explicit — it empties itself.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.inview = "true";
          observer.unobserve(entry.target);
        }
      },
      // Fire once ~12% of the element is visible, slightly inside the fold,
      // so nothing waits until it is half-scrolled past to appear.
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) observer.observe(el);

    // Cursor parallax on the hero board: fine pointers only — on touch the
    // "cursor" is a tap and the effect would just jitter the board.
    const orbit = document.querySelector<HTMLElement>(".hero-orbit");
    const hero = document.querySelector<HTMLElement>(".hero");
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (!orbit || !hero) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        // Normalised -1..1 from the hero's centre; CSS scales it to pixels.
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        orbit.style.setProperty("--lp-px", x.toFixed(3));
        orbit.style.setProperty("--lp-py", y.toFixed(3));
      });
    };
    const onLeave = () => {
      orbit?.style.setProperty("--lp-px", "0");
      orbit?.style.setProperty("--lp-py", "0");
    };
    const finePointer = window.matchMedia("(pointer: fine)");
    if (finePointer.matches && hero) {
      hero.addEventListener("pointermove", onMove);
      hero.addEventListener("pointerleave", onLeave);
    }

    return () => {
      delete root.dataset.lpMotion;
      observer.disconnect();
      cancelAnimationFrame(frame);
      hero?.removeEventListener("pointermove", onMove);
      hero?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return null;
}
