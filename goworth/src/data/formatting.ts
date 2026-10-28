import { useSyncExternalStore } from "react";

export type AppLanguage = "en" | "ro";
export type AppCurrency = "EUR" | "USD";

let language: AppLanguage = "en";
let currency: AppCurrency = "EUR";
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

/** Symbol of the selected currency. Amounts are never converted: switching currency only relabels them. */
export function currencySymbol() { return currency === "USD" ? "$" : "€"; }

export function money(value: number) {
  return new Intl.NumberFormat(language === "ro" ? "ro-RO" : "en-US", {
    style: "currency", currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}
