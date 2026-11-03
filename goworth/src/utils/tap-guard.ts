/** Taps closer together than this count as one: a double tap must not stack the same screen twice. */
export const REPEAT_TAP_MS = 700;

/** Whether a tap on `key` at `now` repeats the last one too soon; records it when it does not. */
export function createTapGuard(windowMs = REPEAT_TAP_MS) {
  let last = { key: "", at: -Infinity };
  return (key: string, now: number) => {
    if (key === last.key && now - last.at < windowMs) return true;
    last = { key, at: now };
    return false;
  };
}
