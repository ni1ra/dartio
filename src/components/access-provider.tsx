"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { parseAccessSnapshot, type AccessSnapshot } from "@/lib/product/access-contract";

type AccessStatus =
  | { readonly status: "loading"; readonly snapshot: null; readonly error: null }
  | { readonly status: "ready"; readonly snapshot: AccessSnapshot; readonly error: null }
  | { readonly status: "unavailable"; readonly snapshot: null; readonly error: string };

type AccessContextValue = AccessStatus & {
  readonly refreshing: boolean;
  readonly retry: () => Promise<AccessSnapshot | null>;
  readonly refresh: () => Promise<AccessSnapshot | null>;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessStatus>({ status: "loading", snapshot: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const snapshot = useRef<AccessSnapshot | null>(null);

  const request = useCallback(async () => {
    const requestId = ++generation.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const response = await fetch("/api/access", { cache: "no-store", signal: nextController.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 503 ? "Paid access could not be verified." : "Access status is unavailable.");
      const next = parseAccessSnapshot(payload);
      if (requestId !== generation.current) return null;
      snapshot.current = next;
      setState({ status: "ready", snapshot: next, error: null });
      return next;
    } catch (problem) {
      if (nextController.signal.aborted || requestId !== generation.current) return null;
      snapshot.current = null;
      setState({ status: "unavailable", snapshot: null, error: problem instanceof Error ? problem.message : "Access status is unavailable." });
      return null;
    } finally {
      if (requestId === generation.current) setRefreshing(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (snapshot.current) setRefreshing(true);
    else setState({ status: "loading", snapshot: null, error: null });
    return request();
  }, [request]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void request());
    return () => {
      window.cancelAnimationFrame(frame);
      generation.current += 1;
      controller.current?.abort();
    };
  }, [request]);

  const value = useMemo<AccessContextValue>(() => ({ ...state, refreshing, retry: load, refresh: load }), [state, refreshing, load]);
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess must be used inside AccessProvider");
  return context;
}
