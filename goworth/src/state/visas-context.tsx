import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { claimAndLoadVisas, markVisasSeen, type Visa } from "@/lib/visas";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";

type VisaState = {
  visas: Visa[];
  /** Visas the award animation has not shown yet, new ones and ones with a new entry. */
  pending: Visa[];
  refresh: () => Promise<void>;
  acknowledge: () => Promise<void>;
};

const VisaContext = createContext<VisaState>({ visas: [], pending: [], refresh: async () => undefined, acknowledge: async () => undefined });

/**
 * The account's passport. Visas are claimed when the account loads and whenever the app comes back to the
 * foreground, since a trip can end while the app sits in the background.
 */
export function VisaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { cloudReady } = useTravel();
  const [visas, setVisas] = useState<Visa[]>([]);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const loaded = await claimAndLoadVisas(userId);
    if (loaded) setVisas(loaded);
  }, [userId]);

  // The last passport read is kept on the phone, so it opens offline too.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    AsyncStorage.getItem(`visas:${userId}`).then((value) => { if (active && value) setVisas((current) => current.length ? current : JSON.parse(value)); }).catch(() => undefined);
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || !cloudReady) return;
    let active = true;
    const load = () => claimAndLoadVisas(userId).then((loaded) => {
      if (!active || !loaded) return;
      setVisas(loaded);
      void AsyncStorage.setItem(`visas:${userId}`, JSON.stringify(loaded)).catch(() => undefined);
    });
    void load();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    return () => { active = false; subscription.remove(); };
  }, [userId, cloudReady]);

  const acknowledge = useCallback(async () => {
    setVisas((current) => current.map((visa) => visa.seen ? visa : { ...visa, seen: true }));
    await markVisasSeen();
  }, []);

  const value = useMemo(() => ({ visas, pending: visas.filter((visa) => !visa.seen), refresh, acknowledge }), [visas, refresh, acknowledge]);
  return <VisaContext value={value}>{children}</VisaContext>;
}

export function useVisas() {
  return useContext(VisaContext);
}
