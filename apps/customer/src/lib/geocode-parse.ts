import { api } from "@/lib/api";

/** Normalizes Google Geocoding API JSON to lat/lon (server returns raw `results`). */
export async function forwardGeocodeToLatLon(addressLine: string): Promise<{
  lat: number;
  lon: number;
}> {
  const data = (await api.public.geocode(addressLine)) as {
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    status?: string;
  };
  const loc = data.results?.[0]?.geometry?.location;
  if (
    !loc ||
    typeof loc.lat !== "number" ||
    typeof loc.lng !== "number" ||
    Number.isNaN(loc.lat) ||
    Number.isNaN(loc.lng)
  ) {
    throw new Error("Could not find that address on the map");
  }
  return { lat: loc.lat, lon: loc.lng };
}
