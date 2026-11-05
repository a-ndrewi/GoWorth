import { useSyncExternalStore } from "react";

/**
 * The launch warm-up: the splash stays over the tabs until Explore, the screen the launch lands on, has everything
 * above the fold in place: the country bubbles, the first card of the discovery deck (its photo downloaded) and the
 * wheel's badge. Lifting earlier showed Explore filling in piece by piece, which read as a second load. The Map globe
 * keeps mounting behind the tabs afterwards; waiting for it held the logo over Explore for seconds.
 */
const waiting = new Set(["explore", "deck", "wheel"]);
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

/**
 * The splash's logo and name are images drawn a few frames after the screen; hiding the native splash before they were
 * up showed the screen without them for a moment, as if the logo had reloaded.
 */
const artPending = new Set(["mark", "name"]);
let artShown = false;

/** One of the splash's images is on screen. */
export function splashArtShown(name: "mark" | "name") {
  if (artShown || !artPending.delete(name)) return;
  if (!artPending.size) { artShown = true; emit(); }
}

const getArtShown = () => artShown;

/** Resolves once the splash's images are on screen (at once if they already are). */
export function whenSplashArtShown() {
  return new Promise<void>((resolve) => {
    if (artShown) { resolve(); return; }
    const listener = () => { if (artShown) { listeners.delete(listener); resolve(); } };
    listeners.add(listener);
  });
}

export function useSplashArtShown() {
  return useSyncExternalStore(subscribe, getArtShown, getArtShown);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getDone = () => done;

/** The longest the cover waits for Explore; a slow network shows Explore's own loading states after that. */
export const bootTimeoutMs = 9000;

export function useBootDone() {
  return useSyncExternalStore(subscribe, getDone, getDone);
}
