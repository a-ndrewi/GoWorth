import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Linking from "expo-linking";
import { isAuthPKCECodeVerifierMissingError, type User } from "@supabase/supabase-js";
import { authLinkMessage, readAuthLink } from "@/utils/auth-link";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { identifyPurchaser } from "@/lib/purchases";
import { removeProfileAvatar } from "@/lib/travel-repository";
import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  ready: boolean;
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
  /** Why the last email link could not sign in, for the sign-in screen to show; empty when there is nothing to say. */
  linkNotice: string;
  clearLinkNotice: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// An email link reaches the app both as the launch URL and as a URL event; each one-time code is exchanged once.
const exchangedCodes = new Set<string>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");

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
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") db.auth.startAutoRefresh();
      else db.auth.stopAutoRefresh();
    });
    const completeLink = async (url: string) => {
      const link = readAuthLink(url);
      if (!link) return;
      if (link.kind === "error") {
        if (mounted) setLinkNotice(authLinkMessage("expired"));
        return;
      }
      if (exchangedCodes.has(link.code)) return;
      exchangedCodes.add(link.code);
      // The exchange emits SIGNED_IN, or PASSWORD_RECOVERY for a reset link, which the listener above handles.
      const { error } = await db.auth.exchangeCodeForSession(link.code, { flowId: link.flowId ?? undefined });
      if (mounted && error) setLinkNotice(authLinkMessage(isAuthPKCECodeVerifierMissingError(error) ? "other-device" : "expired"));
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
      appState.remove();
      linkSubscription.remove();
    };
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (ready) void identifyPurchaser(userId);
  }, [ready, userId]);

  const signOut = async () => {
    if (!supabase) return;
    const signedOut = user?.id;
    // Without a connection the server call fails, but the session on this phone is removed all the same,
    // so the account's local copies are cleared either way.
    const { error } = await supabase.auth.signOut();
    // The offline copy is the account's data; it should not outlive the session on a shared phone.
    if (signedOut) await AsyncStorage.multiRemove([`offline-snapshot:${signedOut}`, `visas:${signedOut}`, `trip-owner:${signedOut}`]).catch(() => undefined);
    if (error && (await supabase.auth.getSession()).data.session) throw error;
  };

  const deleteAccount = async () => {
    if (!supabase || !user) throw new Error("Sign in to delete your account.");
    // Deleting the account row does not reach Storage, so the profile photo is removed first; the account is
    // still deleted if that fails.
    await removeProfileAvatar().catch(() => undefined);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) throw error;
    await AsyncStorage.multiRemove([`external-places:${user.id}`, `discovery-settings:${user.id}`, `offline-snapshot:${user.id}`, `visas:${user.id}`, `trip-owner:${user.id}`]).catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext
      value={{
        user,
        ready,
        passwordRecovery,
        finishPasswordRecovery: () => setPasswordRecovery(false),
        linkNotice,
        clearLinkNotice: () => setLinkNotice(""),
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requires AuthProvider.");
  return context;
}
