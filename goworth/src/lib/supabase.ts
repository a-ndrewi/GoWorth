import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  url && key && key.startsWith("sb_publishable_")
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          // Email links carry a one-time code that only the device which asked for it can exchange,
          // so a link someone else sends cannot sign this phone into their account.
          flowType: "pkce",
          autoRefreshToken: true,
          persistSession: true,
          // Email links reach the app as deep links, which AuthProvider exchanges itself.
          detectSessionInUrl: false,
        },
      })
    : null;
