import { useEffect, useState } from "react";

export type WeatherKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";
export type CurrentWeather = { temperature: number; kind: WeatherKind };
type Point = { latitude: number; longitude: number };

/** WMO weather codes as Open-Meteo reports them, folded into the few icons the app draws. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

/** "18°", rounded, with a true minus sign for frost. */
export function formatTemperature(celsius: number) {
  const value = Math.round(celsius);
  return `${value < 0 ? "−" : ""}${Math.abs(value)}°`;
}

// About a kilometre apart counts as the same place, so a city's cards share one request.
const keyFor = ({ latitude, longitude }: Point) => `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
const cache = new Map<string, { at: number; weather: CurrentWeather | null }>();
const pending = new Map<string, Promise<CurrentWeather | null>>();
const FRESH_MS = 30 * 60 * 1000;

const MAX_BATCH = 50;
const queue: { key: string; resolve: (weather: CurrentWeather | null) => void }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

type Reading = { current?: { temperature_2m?: number; weather_code?: number } };
const toWeather = (reading: Reading | undefined): CurrentWeather | null => typeof reading?.current?.temperature_2m === "number"
  ? { temperature: reading.current.temperature_2m, kind: weatherKind(reading.current.weather_code ?? 0) } : null;

/** One request for every place asked for in the same moment: a list of forty cities costs one call, not forty. */
async function flush() {
  flushTimer = null;
  const batch = queue.splice(0, MAX_BATCH);
  if (queue.length) flushTimer = setTimeout(flush, 0);
  const keys = [...new Set(batch.map((item) => item.key))];
  const points = keys.map((key) => key.split(","));
  const params = new URLSearchParams({
    latitude: points.map(([latitude]) => latitude).join(","), longitude: points.map(([, longitude]) => longitude).join(","),
    current: "temperature_2m,weather_code",
  });
  const results = new Map<string, CurrentWeather | null>();
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    const data: Reading | Reading[] | null = response.ok ? await response.json() : null;
    // A single place comes back as one object, several as a list in the order asked.
    const readings = Array.isArray(data) ? data : [data ?? undefined];
    keys.forEach((key, index) => {
      const weather = toWeather(readings[index] ?? undefined);
      results.set(key, weather);
      if (response.ok) cache.set(key, { at: Date.now(), weather });
    });
  } catch {
    // Offline or refused: nothing is cached, so the next screen asks again.
  }
  for (const item of batch) { pending.delete(item.key); item.resolve(results.get(item.key) ?? null); }
}

/** The weather there right now, from Open-Meteo (free, no key). `null` when it cannot be reached. */
export function loadCurrentWeather(point: Point): Promise<CurrentWeather | null> {
  const key = keyFor(point);
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < FRESH_MS) return Promise.resolve(saved.weather);
  const current = pending.get(key);
  if (current) return current;
  const request = new Promise<CurrentWeather | null>((resolve) => { queue.push({ key, resolve }); });
  pending.set(key, request);
  // A short wait lets a whole list of rows mount and join the same request.
  flushTimer ??= setTimeout(flush, 30);
  return request;
}

/** Current weather for a place, or `null` while it loads, without coordinates, or offline. */
export function useCurrentWeather(point: Point | null | undefined) {
  const valid = !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && (point.latitude !== 0 || point.longitude !== 0);
  const key = valid ? keyFor(point) : "";
  const [state, setState] = useState<{ key: string; weather: CurrentWeather | null }>({ key: "", weather: null });
  useEffect(() => {
    if (!key) return;
    const [latitude, longitude] = key.split(",").map(Number);
    let active = true;
    void loadCurrentWeather({ latitude, longitude }).then((weather) => { if (active) setState({ key, weather }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state.weather : null;
}
