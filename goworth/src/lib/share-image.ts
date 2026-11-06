import type { RefObject } from "react";
import { Platform, Share, type ViewInstance } from "react-native";
import { ImageFormat, makeImageFromView } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";

/** Image sharing goes through the iOS share sheet; Android's built-in share takes text only. */
export const canShareImages = Platform.OS === "ios";

/**
 * Captures a mounted view as a PNG at the screen's pixel density and opens the share sheet with it, so it can go
 * to Instagram, TikTok, Messages or Photos. Resolves once the sheet closes.
 */
export async function shareViewAsImage(view: RefObject<ViewInstance | null>, name: string) {
  // Skia types its argument as a class component; any mounted host view captures the same way.
  const image = await makeImageFromView(view as unknown as Parameters<typeof makeImageFromView>[0]);
  if (!image) throw new Error("Could not create the image. Try again.");
  const file = new File(Paths.cache, `${name.replace(/[^a-z0-9-]+/gi, "-")}.png`);
  if (file.exists) file.delete();
  file.create();
  await file.write(image.encodeToBytes(ImageFormat.PNG, 100));
  await Share.share({ url: file.uri });
  return file.uri;
}
