import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { cleanReferralCode, redeemReferral, referralMetadataKey } from "@/lib/referral";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";

/**
 * A friend's code entered at sign-up waits with the account until the email is confirmed and the app first opens.
 * It is used here once, after the username is saved, and then cleared, so a failure is shown only once.
 */
export function ReferralAutoRedeem() {
  const { user } = useAuth();
  const { cloudReady, offlineSince, profile, refreshMembership } = useTravel();
  const language = useAppLanguage();
  const tried = useRef("");
  const pending = typeof user?.user_metadata?.[referralMetadataKey] === "string" ? cleanReferralCode(user.user_metadata[referralMetadataKey]) : "";

  useEffect(() => {
    if (!user || !pending || !cloudReady || offlineSince || !profile.username || tried.current === user.id) return;
    tried.current = user.id;
    void (async () => {
      let message = "";
      try {
        const result = await redeemReferral(pending);
        await refreshMembership().catch(() => undefined);
        message = result.validUntil
          ? formatMessage("You both won a month of Premium. Yours is active until {date}.", {
            date: new Date(result.validUntil).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { day: "numeric", month: "long", year: "numeric" }),
          }, language)
          : translate("Your friend won a month of Premium.", language);
        Alert.alert(translate("Welcome to GoWorth!", language), message);
      } catch (caught) {
        const reason = caught instanceof Error ? caught.message : "";
        // A code already used (on another phone, say) needs no message.
        if (!/already used/i.test(reason)) Alert.alert(translate("Invite code not used", language), translate(reason || "Could not use this invite code.", language));
      }
      await supabase?.auth.updateUser({ data: { [referralMetadataKey]: null } }).catch(() => undefined);
    })();
  }, [user, pending, cloudReady, offlineSince, profile.username, refreshMembership, language]);

  return null;
}
