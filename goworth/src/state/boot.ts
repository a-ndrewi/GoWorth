import { useSyncExternalStore } from "react";

/**
 * The launch warm-up: the splash stays over the tabs until Explore, the screen the launch lands on, has mounted
 * what is on screen. The Map globe keeps mounting behind the tabs afterwards; waiting for it held the logo over
 * Explore for seconds.
 */
const waiting = new Set(["explore"]);
let done = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** A screen has mounted all it needs; the cover lifts once every screen has. */
export function finishBootTask(name: string) {
  if (done || !waiting.delete(name)) return;
  if (!waiting.size) { done = true; emit(); }
}

/** Ends the warm-up at once: it took too long, or the launch went somewhere other than the tabs. */
export function finishBoot() {
  if (done) return;
  done = true;
  waiting.clear();
  emit();
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getDone = () => done;

export function useBootDone() {
  return useSyncExternalStore(subscribe, getDone, getDone);
}
