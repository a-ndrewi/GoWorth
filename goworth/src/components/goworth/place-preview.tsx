import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { Copy, Icon } from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { findPlacePhoto, type PlacePhoto } from "@/data/place-photo";

export function PlacePreviewPhoto({ name, location }: { name: string; location: string }) {
  const key = `${name}|${location}`;
  const [result, setResult] = useState<{ key: string; photo: PlacePhoto | null; status: "ready" | "empty" | "error" } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const status = result?.key === key ? result.status : "loading";
  const photo = result?.key === key ? result.photo : null;
  const imageFailed = failedKey === key;

  useEffect(() => {
    let active = true;
    findPlacePhoto(name, location).then((result) => {
      if (!active) return;
      setResult({ key, photo: result, status: result ? "ready" : "empty" });
    }).catch(() => { if (active) setResult({ key, photo: null, status: "error" }); });
    return () => { active = false; };
  }, [key, name, location]);

  return <View style={{ gap: 7 }}>
    <View style={{ height: 215, borderRadius: 6, overflow: "hidden", backgroundColor: p.greenSoft, alignItems: "center", justifyContent: "center" }}>
      {status === "ready" && photo && !imageFailed
        ? <Image source={{ uri: photo.url }} contentFit="cover" accessibilityLabel={`Photo of ${name}`} onError={() => setFailedKey(key)} style={{ width: "100%", height: "100%" }} />
        : <View style={{ alignItems: "center", gap: 8, padding: 20 }}>
          {status === "loading" ? <ActivityIndicator color={p.green} /> : <Icon name="camera" color={p.green} size={27} />}
          <Copy style={{ color: p.green, textAlign: "center", fontSize: 13 }}>
            {status === "loading" ? "Finding a photo of this place…" : status === "error" ? "Photo search is unavailable right now" : "No verified photo for this place"}
          </Copy>
        </View>}
    </View>
    {status === "ready" && photo && !imageFailed &&
      <Pressable accessibilityRole="link" accessibilityLabel={`Photo source and license for ${name}`} onPress={() => void Linking.openURL(photo.pageUrl)}>
        <Copy muted style={{ fontSize: 11, lineHeight: 16 }}>Photo: {photo.artist} · {photo.license} · Wikimedia Commons ↗</Copy>
      </Pressable>}
  </View>;
}
