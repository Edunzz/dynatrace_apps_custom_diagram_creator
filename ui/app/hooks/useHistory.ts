import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 100;

/** Simple in-memory snapshot-based history (undo / redo). */
export function useHistory<T>(getCurrent: () => T, apply: (snapshot: T) => void) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  /** Saves the current state before a modification. */
  const record = useCallback(() => {
    past.current.push(structuredClone(getCurrent()));
    if (past.current.length > MAX_HISTORY) {
      past.current.shift();
    }
    future.current = [];
    bump();
  }, [getCurrent]);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (previous === undefined) {
      return;
    }
    future.current.push(structuredClone(getCurrent()));
    apply(previous);
    bump();
  }, [getCurrent, apply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) {
      return;
    }
    past.current.push(structuredClone(getCurrent()));
    apply(next);
    bump();
  }, [getCurrent, apply]);

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    bump();
  }, []);

  return {
    record,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
