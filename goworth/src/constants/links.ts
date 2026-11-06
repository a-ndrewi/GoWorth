/**
 * Public GoWorth accounts and store listings.
 */
export const socialLinks = {
  instagram: "https://www.instagram.com/goworth.app/",
  tiktok: "https://www.tiktok.com/@goworth",
};

export const storeListing = {
  /** The numeric Apple ID shown in App Store Connect > App Information. Empty until the app record exists. */
  appStoreId: "",
  androidPackage: "com.andrewi.goworth",
};

/** Public store pages for downloading GoWorth. The App Store link is null until appStoreId is filled in. */
export const storeLinks = {
  appStore: storeListing.appStoreId ? `https://apps.apple.com/app/id${storeListing.appStoreId}` : null,
  googlePlay: `https://play.google.com/store/apps/details?id=${storeListing.androidPackage}`,
};
