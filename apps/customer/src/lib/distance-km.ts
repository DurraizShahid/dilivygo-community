import { getDistance } from "geolib";

/** Great-circle distance in kilometres (WGS84), same semantics as the backend `haversineKm`. */
export function getDistanceKmBetweenCoords(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return (
    getDistance(
      { latitude: aLat, longitude: aLon },
      { latitude: bLat, longitude: bLon },
    ) / 1000
  );
}

export function getDistanceKm(
  userLat?: number | null,
  userLon?: number | null,
  shopLat?: number,
  shopLon?: number,
): number | null {
  if (
    userLat == null ||
    userLon == null ||
    shopLat == null ||
    shopLon == null
  ) {
    return null;
  }
  return getDistanceKmBetweenCoords(userLat, userLon, shopLat, shopLon);
}
