import { useEffect, useState } from "react";
import * as Location from "expo-location";
import * as Localization from "expo-localization";
import { api } from "@/lib/api";

/**
 * ISO 3166-1 alpha-2 from GPS reverse-geocode when permission is granted,
 * otherwise device locale region, matching customer web login phone defaults.
 */
export function useLoginGeoCountryCode(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const localeRegion =
      Localization.getLocales()[0]?.regionCode?.toUpperCase() ?? null;

    async function run() {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (perm.status !== Location.PermissionStatus.GRANTED) {
        if (localeRegion && localeRegion.length === 2) setCode(localeRegion);
        return;
      }

      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const geo = await api.public.reverseGeocode(
          pos.coords.latitude,
          pos.coords.longitude
        );
        const cc = geo?.countryCode?.trim().toUpperCase();
        if (cc && cc.length === 2) {
          setCode(cc);
          return;
        }
      } catch {
        /* use locale fallback */
      }

      if (cancelled) return;
      if (localeRegion && localeRegion.length === 2) setCode(localeRegion);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return code;
}
