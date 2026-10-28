import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { Linking, Platform } from "react-native";
import { storeListing } from "@/constants/links";

/** The store this device reviews in, or null where there is none (web). */
export const reviewStoreName = Platform.OS === "ios" ? "App Store" : Platform.OS === "android" ? "Google Play" : null;

// Apple and Google show the native prompt only a few times a year and give no sign when they skip it,
// so after one native attempt the button opens the store page instead.
const nativeAttemptKey = "store-review:native-attempt";
const nativeCooldownMs = 120 * 24 * 60 * 60 * 1000;

function writeReviewUrl() {
  if (Platform.OS === "ios") return storeListing.appStoreId
    ? `itms-apps://apps.apple.com/app/id${storeListing.appStoreId}?action=write-review` : null;
  if (Platform.OS === "android") return `market://details?id=${storeListing.androidPackage}&showAllReviews=true`;
  return null;
}

export async function openStoreReview() {
  const url = writeReviewUrl();
  const lastNative = Number(await AsyncStorage.getItem(nativeAttemptKey).catch(() => null)) || 0;
  const nativeDue = Date.now() - lastNative > nativeCooldownMs;
  if ((nativeDue || !url) && await StoreReview.hasAction().catch(() => false)) {
    await AsyncStorage.setItem(nativeAttemptKey, String(Date.now())).catch(() => undefined);
    await StoreReview.requestReview();
    return;
  }
  if (url) {
    await Linking.openURL(url).catch(() => Platform.OS === "android"
      ? Linking.openURL(`https://play.google.com/store/apps/details?id=${storeListing.androidPackage}`)
      : Promise.reject(new Error("Could not open the App Store.")));
    return;
  }
  throw new Error("The store page is not available yet.");
}
