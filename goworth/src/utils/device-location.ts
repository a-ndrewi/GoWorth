import * as Location from "expo-location";
import type { Coordinates } from "../data/discovery";

let request: { at: number; position: Promise<Coordinates | null> } | null = null;

/**
 * Where the device is, or `null` when location is off or refused. Explore's deck and its nearby suggestions both ask
 * at once, so they share one permission prompt and one fix; the fix is reused for five minutes.
 */
export function deviceLocation(): Promise<Coordinates | null> {
  if (request && Date.now() - request.at < 5 * 60 * 1000) return request.position;
  const position = Location.requestForegroundPermissionsAsync().then(async (permission) => {
    if (permission.status !== "granted") return null;
    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: result.coords.latitude, longitude: result.coords.longitude };
  }).catch(() => null);
  request = { at: Date.now(), position };
  // A refusal or failure is asked again next time rather than remembered.
  void position.then((value) => { if (!value && request?.position === position) request = null; });
  return position;
}
