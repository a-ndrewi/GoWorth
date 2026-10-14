import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export type AppLanguage = "en" | "ro";
export type AppCurrency = "EUR" | "USD";
type ExchangeRate = { rate: number; date: string };

let language: AppLanguage = "en";
let currency: AppCurrency = "EUR";
let usdRate: ExchangeRate | null = null;
const languageListeners = new Set<() => void>();
export function getLanguage() { return language; }
function subscribeLanguage(listener: () => void) {
  languageListeners.add(listener);
  return () => { languageListeners.delete(listener); };
}
export function useAppLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => "en" as AppLanguage);
}

export function setDisplaySettings(next: { language: AppLanguage; currency: AppCurrency }) {
  const languageChanged = language !== next.language;
  language = next.language;
  currency = next.currency;
  if (languageChanged) languageListeners.forEach((listener) => listener());
}

export function currentExchangeRate() { return usdRate; }

export async function loadUsdRate(): Promise<ExchangeRate> {
  try {
    const response = await fetch("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Exchange rate unavailable");
    const data: {
      dataSets?: { series?: Record<string, { observations?: Record<string, number[]> }> }[];
      structure?: { dimensions?: { observation?: { values?: { id: string }[] }[] } };
    } = await response.json();
    const series = Object.values(data.dataSets?.[0]?.series || {})[0];
    const rate = Object.values(series?.observations || {})[0]?.[0];
    const date = data.structure?.dimensions?.observation?.[0]?.values?.[0]?.id;
    if (!rate || !Number.isFinite(rate) || !date) throw new Error("Invalid exchange rate");
    usdRate = { rate, date };
    await AsyncStorage.setItem("ecb-usd-rate", JSON.stringify(usdRate)).catch(() => undefined);
    return usdRate;
  } catch {
    const saved = await AsyncStorage.getItem("ecb-usd-rate").catch(() => null);
    if (saved) {
      const parsed: ExchangeRate = JSON.parse(saved);
      if (Number.isFinite(parsed.rate) && Date.now() - Date.parse(parsed.date) < 7 * 86_400_000) {
        usdRate = parsed;
        return parsed;
      }
    }
    throw new Error("USD conversion is unavailable. Try again when the ECB rate is online.");
  }
}

export function money(value: number) {
  const target = currency === "USD" && usdRate ? "USD" : "EUR";
  const amount = target === "USD" ? value * usdRate!.rate : value;
  return new Intl.NumberFormat(language === "ro" ? "ro-RO" : "en-US", {
    style: "currency", currency: target,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}
