import type { Product, Shop } from "@dilivygo/types";
import { getDistance } from "geolib";

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
  return (
    getDistance(
      { latitude: userLat, longitude: userLon },
      { latitude: shopLat, longitude: shopLon },
    ) / 1000
  );
}

export function relevanceScore(
  shop: Shop,
  tokens: string[],
  cuisines: string[],
  products: Product[],
): number {
  const text = [
    shop.name,
    shop.description,
    shop.address,
    ...cuisines,
    ...products.map((p) => p.name),
    ...products.map((p) => p.category ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.reduce(
    (score, token) => (text.includes(token) ? score + 1 : score),
    0,
  );
}
