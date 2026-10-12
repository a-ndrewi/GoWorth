import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  ready: boolean;
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const db = supabase;
    if (!db) return;
    let mounted = true;
    const { data: listener } = db.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setReady(true);
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        if (event === "SIGNED_OUT") setPasswordRecovery(false);
      }
    });
    const appState =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") db.auth.startAutoRefresh();
            else db.auth.stopAutoRefresh();
          });
    const completeLink = async (url: string) => {
      if (Platform.OS === "web") return;
      const fragment = url.split("#")[1];
      if (!fragment) return;
      const params = new URLSearchParams(fragment);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) return;
      if (params.get("type") === "recovery") setPasswordRecovery(true);
      await db.auth.setSession({ access_token, refresh_token });
    };
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void completeLink(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void completeLink(url);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      appState?.remove();
      linkSubscription.remove();
    };
  }, []);

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext value={{ user, ready, passwordRecovery, finishPasswordRecovery: () => setPasswordRecovery(false), signOut }}>{children}</AuthContext>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requires AuthProvider.");
  return context;
}
