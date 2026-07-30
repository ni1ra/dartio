"use client";

import { useEffect, useRef } from "react";
import type { MatchRecord } from "@/domain/match-record";
import { recordCompletedMatch } from "@/lib/product/match-history-client";

/**
 * Files a match with the server the moment it finishes, exactly once.
 *
 * Every mode calls this with its own record, built by its own adapter, so none of
 * them learns anything about another. The guard is a ref rather than state because
 * a completed match re-renders for other reasons — a correction dialog opening, a
 * theme change — and history should not gain a duplicate row each time.
 *
 * Nothing is reported to the player. A signed-out player has no history by design,
 * and a network failure at the end of a leg is not worth an error card over a match
 * that is already won.
 */
export function useRecordMatch(record: MatchRecord | null, ownerSeat = 0): void {
  const filed = useRef(false);

  useEffect(() => {
    if (!record || filed.current) return;
    filed.current = true;
    const controller = new AbortController();
    void recordCompletedMatch(record, ownerSeat, { signal: controller.signal });
    return () => controller.abort();
  }, [record, ownerSeat]);
}
