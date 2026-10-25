import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Copy, Icon } from "@/components/goworth/ui";
import { Shimmer } from "@/components/goworth/loading";
import { usePalette } from "@/state/theme-context";
import { findPlacePhoto, peekPlacePhoto, photoSource, sizedPhotoUrl, type PhotoWidth, type PlacePhoto } from "@/data/place-photo";
import type { Venue } from "@/data/nearby-places";
import { VenueArt, VenueTile } from "@/components/goworth/venue-art";
import { useAppLanguage } from "@/data/formatting";
import { translateAccessibility } from "@/data/i18n";

type PlacePhotoProps = { name: string; location: string; latitude?: number; longitude?: number; sourceUrl?: string };
const noFailedUrls: string[] = [];

/** Restaurants, bars, cafés and clubs rarely have a free photo, so they show their venue art instead of searching for one. */
export function PlacePreviewPhoto({ venue, ...props }: PlacePhotoProps & { badge?: string; venue?: Venue }) {
  if (venue) return <View style={{ height: 215, borderRadius: 6, overflow: "hidden" }}>
    <VenueArt venue={venue} compact />
    {!!props.badge && <View pointerEvents="none" style={{ position: "absolute", left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(16, 28, 48, 0.86)" }}><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{props.badge}</Text></View>}
  </View>;
  return <PlaceSearchPhoto {...props} />;
}

function PlaceSearchPhoto({ name, location, latitude, longitude, sourceUrl, badge }: PlacePhotoProps & { badge?: string }) {
  const p = usePalette();
  const language = useAppLanguage();
  const key = `${name}|${location}|${latitude ?? ""}|${longitude ?? ""}|${sourceUrl ?? ""}`;
  const [result, setResult] = useState<{ key: string; photo: PlacePhoto | null; status: "ready" | "empty" | "error" } | null>(null);
  const [failed, setFailed] = useState<{ key: string; urls: string[] }>({ key, urls: [] });
  const failedUrls = failed.key === key ? failed.urls : noFailedUrls;
  const status = result?.key === key ? result.status : "loading";
  const photo = result?.key === key ? result.photo : null;
  const imageFailed = !!photo && failedUrls.includes(photo.url);
  const [loadedUrl, setLoadedUrl] = useState("");

  useEffect(() => {
    let active = true;
    findPlacePhoto(name, location, latitude, longitude, sourceUrl, failedUrls).then((result) => {
      if (!active) return;
      setResult({ key, photo: result, status: result ? "ready" : "empty" });
    }).catch(() => { if (active) setResult({ key, photo: null, status: "error" }); });
    return () => { active = false; };
  }, [key, name, location, latitude, longitude, sourceUrl, failedUrls]);

  const showPhoto = status === "ready" && !!photo && !imageFailed;
  // The shimmer stays under the photo until it has downloaded, so the frame never flashes empty.
  const shimmering = status === "loading" || (showPhoto && loadedUrl !== photo.url);
  return <View style={{ gap: 7 }}>
    <View style={{ height: 215, borderRadius: 6, overflow: "hidden", backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" }}>
      {shimmering && <Shimmer style={StyleSheet.absoluteFill} />}
      {showPhoto
        ? <Image source={photoSource(photo.url, 960)} cachePolicy="memory-disk" transition={160} contentFit="cover" accessibilityLabel={translateAccessibility(`Photo of ${name}`, language)} onLoad={() => setLoadedUrl(photo.url)} onError={() => setFailed({ key, urls: [...failedUrls, photo.url] })} style={{ width: "100%", height: "100%" }} />
        : status !== "loading" && <View style={{ alignItems: "center", gap: 8, padding: 20 }}>
          <Icon name="camera" size={26} color={p.blue} />
          <Copy muted style={{ textAlign: "center", fontSize: 13 }}>
            {imageFailed ? "Finding a photo of this place…" : status === "error" ? "Photo search is unavailable right now" : "No verified photo for this place"}
          </Copy>
        </View>}
      {!!badge && status === "ready" && photo && !imageFailed && <View pointerEvents="none" style={{ position: "absolute", left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(16, 28, 48, 0.86)" }}><Text style={{ color: p.onColor, fontSize: 12, fontWeight: "700" }}>{badge}</Text></View>}
    </View>
  </View>;
}

type ThumbnailProps = PlacePhotoProps & { style?: StyleProp<ViewStyle>; thumbWidth?: PhotoWidth; onPhotoAvailable?: (available: boolean) => void };

export function PlaceThumbnail({ venue, ...props }: ThumbnailProps & { venue?: Venue }) {
  if (venue) return <View style={[{ width: 54, height: 54, borderRadius: 5, overflow: "hidden" }, props.style]}><VenueTile venue={venue} large={(props.thumbWidth ?? 120) >= 330} /></View>;
  return <PlaceSearchThumbnail {...props} />;
}

function PlaceSearchThumbnail({ name, location, latitude, longitude, sourceUrl, style, thumbWidth = 120, onPhotoAvailable }: ThumbnailProps) {
  const p = usePalette();
  const language = useAppLanguage();
  const onPhotoAvailableRef = useRef(onPhotoAvailable);
  useEffect(() => { onPhotoAvailableRef.current = onPhotoAvailable; }, [onPhotoAvailable]);
  const key = `${name}|${location}|${latitude ?? ""}|${longitude ?? ""}|${sourceUrl ?? ""}`;
  const [result, setResult] = useState<{ key: string; photo: PlacePhoto | null } | null>(() => {
    const known = peekPlacePhoto(name, location, latitude, longitude, sourceUrl);
    return known === undefined ? null : { key, photo: known };
  });
  const [failed, setFailed] = useState<{ key: string; urls: string[] }>({ key, urls: [] });
  const failedUrls = failed.key === key ? failed.urls : noFailedUrls;
  const photo = result?.key === key ? result.photo : null;
  const loading = result?.key !== key;
  const [loadedUrl, setLoadedUrl] = useState("");
  useEffect(() => {
    let active = true;
    findPlacePhoto(name, location, latitude, longitude, sourceUrl, failedUrls).then((photo) => {
      if (active) {
        setResult({ key, photo });
        onPhotoAvailableRef.current?.(!!photo);
      }
    }).catch(() => {
      // Not remembered as "no photo": the next time this thumbnail mounts it looks again.
      if (!active) return;
      setResult({ key, photo: null });
      onPhotoAvailableRef.current?.(false);
    });
    return () => { active = false; };
  }, [key, name, location, latitude, longitude, sourceUrl, failedUrls]);
  const showPhoto = !!photo && !failedUrls.includes(photo.url);
  const url = showPhoto ? sizedPhotoUrl(photo.url, thumbWidth) : "";
  return <View style={[{ width: 54, height: 54, borderRadius: 5, overflow: "hidden", backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" }, style]}>
    {(loading || (showPhoto && loadedUrl !== url)) && <Shimmer style={StyleSheet.absoluteFill} />}
    {showPhoto
      ? <Image source={photoSource(url, thumbWidth)} recyclingKey={key} cachePolicy="memory-disk" transition={120} contentFit="cover" accessibilityLabel={translateAccessibility(`Photo of ${name}`, language)} onLoad={() => setLoadedUrl(url)} onError={() => setFailed({ key, urls: [...failedUrls, photo.url] })} style={{ width: "100%", height: "100%" }} />
      : !loading && <Icon name="pin" size={thumbWidth >= 330 ? 28 : 18} color={p.blue} />}
  </View>;
}
