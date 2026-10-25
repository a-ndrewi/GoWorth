import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { palettes, type ColorScheme, type Palette, type ThemedStyles } from "@/constants/design";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type ThemePreference = "system" | "light" | "dark";
const storageKey = "theme-preference";

type ThemeValue = {
  preference: ThemePreference;
  scheme: ColorScheme;
  /** False until the saved preference has been read; screens drawn before then may use the wrong theme. */
  ready: boolean;
  palette: Palette;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue>({
  preference: "system", scheme: "light", ready: true, palette: palettes.light, setPreference: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (active && (saved === "light" || saved === "dark")) setPreferenceState(saved);
    }).catch(() => undefined).finally(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(storageKey, next).catch(() => undefined);
  }, []);

  // Native pickers, alerts and the keyboard follow the app's choice rather than the system's.
  useEffect(() => {
    if (Platform.OS !== "web") Appearance.setColorScheme(preference === "system" ? "auto" : preference);
  }, [preference]);

  const scheme: ColorScheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palettes[scheme].white).catch(() => undefined);
  }, [scheme]);

  const value = useMemo(() => ({ preference, scheme, ready, palette: palettes[scheme], setPreference }), [preference, scheme, ready, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  return useContext(ThemeContext);
}

/** The active colors. Calling it also re-renders the component when the theme changes. */
export function usePalette() {
  return useContext(ThemeContext).palette;
}

/** The styles of a `themedStyles` sheet for the active theme. */
export function useStyles<S>(sheet: ThemedStyles<S>) {
  return sheet.resolve(useContext(ThemeContext).scheme);
}
