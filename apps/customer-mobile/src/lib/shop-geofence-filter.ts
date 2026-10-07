import type { GeoPolygon, Shop } from "@dilivygo/types";
import { isPointInPolygon } from "geolib";

/**
 * Mirrors apps/server/lib/geo.js for customer-visible shop filtering at a delivery point.
 */

function circleToPolygon(lat: number, lon: number, radiusKm: number, numPoints = 32): GeoPolygon {
  const coords: number[][] = [];
  const R = 6371;
  for (let i = 0; i <= numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const dLat = (radiusKm / R) * Math.cos(angle);
    const dLon = ((radiusKm / R) * Math.sin(angle)) / Math.cos((lat * Math.PI) / 180);
    coords.push([lon + dLon * (180 / Math.PI), lat + dLat * (180 / Math.PI)]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function getEffectiveGeofence(shop: Shop): GeoPolygon | null {
  const drawn = shop.deliveryGeofence;
  if (drawn?.coordinates?.[0] && drawn.coordinates[0].length > 2) {
    return drawn;
  }
  if (shop.lat != null && shop.lon != null) {
    const radius = shop.deliveryRadiusKm ?? 5.0;
    return circleToPolygon(shop.lat, shop.lon, radius);
  }
  return null;
}

/** Same rules as listShops in public.controller.js when lat/lon are provided. */
export function isShopDeliverableAtPoint(shop: Shop, lat: number, lon: number): boolean {
  const geofence = getEffectiveGeofence(shop);
  if (!geofence) return true;
  const ring = geofence.coordinates?.[0];
  if (!ring?.length) return true;
  const vertices = ring.map((c) => ({
    latitude: c[1] as number,
    longitude: c[0] as number,
  }));
  return isPointInPolygon({ latitude: lat, longitude: lon }, vertices);
}

export function filterShopsByDeliveryPoint(shops: Shop[], lat: number, lon: number): Shop[] {
  return shops.filter((s) => isShopDeliverableAtPoint(s, lat, lon));
}
