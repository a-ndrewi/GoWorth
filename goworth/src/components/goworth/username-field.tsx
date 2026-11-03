import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Field, Icon, Row } from "@/components/goworth/ui";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { supabase } from "@/lib/supabase";
import { usePalette } from "@/state/theme-context";

export const usernamePattern = /^[A-Za-z0-9_]{3,24}$/;
export const cleanUsername = (value: string) => value.trim().replace(/^@/, "");
export type UsernameStatus = "empty" | "invalid" | "checking" | "available" | "taken" | "unknown";

/** Asks the server whether a username is free; null when it cannot tell (offline, or before the migration). */
export async function usernameAvailable(username: string): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("username_available", { p_username: username });
  return error ? null : !!data;
}

/** Where a typed username stands: its format right away, then whether it is free a moment after typing stops. */
export function useUsernameStatus(value: string): UsernameStatus {
  const username = cleanUsername(value);
  const [checked, setChecked] = useState<{ username: string; available: boolean | null } | null>(null);
  const latest = useRef("");
  const valid = usernamePattern.test(username);
  useEffect(() => {
    if (!valid) return;
    latest.current = username;
    const timer = setTimeout(() => {
      void usernameAvailable(username).then((available) => { if (latest.current === username) setChecked({ username, available }); });
    }, 350);
    return () => clearTimeout(timer);
  }, [username, valid]);
  if (!username) return "empty";
  if (!valid) return "invalid";
  if (checked?.username !== username) return "checking";
  return checked.available === null ? "unknown" : checked.available ? "available" : "taken";
}

/** A username input with a live line underneath: the rule, "checking", free or taken. */
export function UsernameField({ value, onChangeText, status, label = "Username" }: {
  value: string; onChangeText: (value: string) => void; status: UsernameStatus; label?: string;
}) {
  const p = usePalette();
  const language = useAppLanguage();
  const line = status === "available" ? ["check", p.green, "This username is free."] as const
    : status === "taken" ? ["close", p.danger, "Username is already taken."] as const
    : status === "invalid" ? ["info", p.danger, "Use 3-24 letters, numbers or underscores."] as const
    : ["info", p.muted, "Friends find you by it to invite you on trips."] as const;
  return <View style={{ gap: 6 }}>
    <Field label={label} placeholder="username" value={value} onChangeText={onChangeText} autoCapitalize="none" autoCorrect={false}
      autoComplete="username" textContentType="username" maxLength={25} />
    <Row style={{ gap: 6 }}>
      {status === "checking" ? <ActivityIndicator size="small" color={p.muted} /> : <Icon name={line[0]} size={13} color={line[1]} />}
      <Text style={{ color: status === "checking" ? p.muted : line[1], fontSize: 12, fontWeight: "600", flex: 1 }}>
        {translate(status === "checking" ? "Checking…" : line[2], language)}
      </Text>
    </Row>
  </View>;
}
