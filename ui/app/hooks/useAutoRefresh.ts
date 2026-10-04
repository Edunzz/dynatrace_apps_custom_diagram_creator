import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` (null = disabled).
 * Pauses while the tab is hidden and, on return, refreshes if the interval has already elapsed.
 */
export function useAutoRefresh(intervalMs: number | null, callback: () => void): void {
  const callbackRef = useRef(callback);
  const lastRunRef = useRef(Date.now());

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs) {
      return undefined;
    }
    lastRunRef.current = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      lastRunRef.current = Date.now();
      callbackRef.current();
    };
    const timer = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRunRef.current >= intervalMs) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
