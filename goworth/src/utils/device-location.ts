import * as Location from "expo-location";
import type { Coordinates } from "../data/discovery";
import { nearestCity } from "../data/geography";

let request: { at: number; position: Promise<Coordinates | null> } | null = null;

/**
 * Where the device is, or `null` when location is off or refused. Explore's deck and its nearby suggestions both ask
 * at once, so they share one permission prompt and one fix; the fix is reused for five minutes.
 */
export function deviceLocation(): Promise<Coordinates | null> {
  if (request && Date.now() - request.at < 5 * 60 * 1000) return request.position;
  return locate(Location.requestForegroundPermissionsAsync());
}

/**
 * Starts finding the device at launch, behind the splash, so Explore opens already knowing where it is instead of
 * showing a worldwide deck and reloading it once a fix arrives. It never asks for permission; Explore does that.
 */
export function warmDeviceLocation() {
  if (request && Date.now() - request.at < 5 * 60 * 1000) return;
  void locate(Location.getForegroundPermissionsAsync());
}

function locate(permissionCheck: Promise<Location.LocationPermissionResponse>) {
  const position = permissionCheck.then(async (permission) => {
    if (permission.status !== "granted") return null;
    // A fix from the last quarter hour is close enough for a deck of places within kilometres, and is instant.
    const result = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000 })
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: result.coords.latitude, longitude: result.coords.longitude };
  }).catch(() => null);
  request = { at: Date.now(), position };
  // A refusal or failure is asked again next time rather than remembered.
  void position.then((value) => { if (!value && request?.position === position) request = null; });
  return position;
}

/** Where the device is and the country it is in, from the nearest known city; asks for permission only when `ask` is set. */
export async function deviceCountry(ask: boolean): Promise<(Coordinates & { countryCode: string }) | null> {
  const permission = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") return null;
  const position = await Location.getLastKnownPositionAsync()
    ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = position.coords;
  const countryCode = nearestCity(latitude, longitude)?.countryCode;
  return countryCode ? { latitude, longitude, countryCode } : null;
}
