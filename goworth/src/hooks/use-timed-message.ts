import { useCallback, useEffect, useState } from "react";

/** How long any in-app notice, error or toast stays on screen. */
export const NOTICE_DURATION_MS = 5000;

/**
 * A message state that clears itself NOTICE_DURATION_MS after it was last set.
 * Setting the same text again restarts the countdown.
 */
export function useTimedMessage() {
  const [state, setState] = useState({ text: "", id: 0 });

  useEffect(() => {
    if (!state.text) return;
    const timer = setTimeout(() => setState((current) => current.id === state.id ? { ...current, text: "" } : current), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const setText = useCallback((text: string) => setState((current) => ({ text, id: current.id + 1 })), []);
  return [state.text, setText] as const;
}
