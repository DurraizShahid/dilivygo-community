import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CustomerAddress } from "@dilivygo/types";
import { api } from "@/lib/api";
import {
  customerAddressHeaderLine,
  formatCustomerAddressLine,
} from "@/lib/customer-address";
import { forwardGeocodeToLatLon } from "@/lib/geocode-parse";

const safeStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
);

interface LocationState {
  lat: number | null;
  lon: number | null;
  address: string | null;
  /** ISO 3166-1 alpha-2 from reverse geocode, for language hints */
  countryCode: string | null;
  status: "idle" | "loading" | "granted" | "denied";
  /** When set, delivery point came from a saved address (not live GPS). */
  savedAddressId: string | null;
  setLocation: (lat: number, lon: number) => void;
  setAddress: (address: string) => void;
  setCountryCode: (code: string | null) => void;
  setStatus: (status: LocationState["status"]) => void;
  detectLocation: () => void;
  applySavedAddress: (addr: CustomerAddress) => Promise<void>;
  clearSavedAddressSelection: () => void;
  clear: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      lat: null,
      lon: null,
      address: null,
      countryCode: null,
      status: "idle",
      savedAddressId: null,

      setLocation: (lat, lon) => set({ lat, lon, status: "granted" }),
      setAddress: (address) => set({ address }),
      setCountryCode: (code) => set({ countryCode: code }),
      setStatus: (status) => set({ status }),

      detectLocation: () => {
        if (typeof window === "undefined" || !navigator.geolocation) {
          set({ status: "denied" });
          return;
        }
        // Clear existing address so the UI doesn't show stale data while re-detecting.
        set({
          status: "loading",
          address: null,
          countryCode: null,
          savedAddressId: null,
        });
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;

            // Update coordinates immediately so restaurant filtering refreshes.
            set({ lat, lon, status: "granted" });

            // Reverse-geocode to a human-readable address (best-effort).
            void (async () => {
              try {
                const geo = await api.public.reverseGeocode(lat, lon);
                if (geo?.countryCode) {
                  set({ countryCode: geo.countryCode });
                }
                if (geo && typeof geo.address === "string") {
                  // Safety net: strip any Google Plus Code prefix that might
                  // still come through as part of `formatted_address`.
                  const PLUS_CODE_PREFIX_RE =
                    /^([0-9A-Z]{4,6}\+[0-9A-Z]{2,4})(?:,)?\s*/i;
                  const cleaned = geo.address.replace(PLUS_CODE_PREFIX_RE, "").trim();
                  if (cleaned) set({ address: cleaned });
                }
              } catch {
                // Ignore reverse-geocoding failures; coordinates are still useful.
              }
            })();
          },
          () => {
            set({ status: "denied", address: null, countryCode: null });
          },
          { enableHighAccuracy: false, timeout: 10000 }
        );
      },

      applySavedAddress: async (addr) => {
        const line = formatCustomerAddressLine(addr);
        let lat = addr.lat ?? null;
        let lon = addr.lon ?? null;
        if (lat == null || lon == null) {
          const g = await forwardGeocodeToLatLon(line);
          lat = g.lat;
          lon = g.lon;
        }
        set({
          lat,
          lon,
          address: customerAddressHeaderLine(addr),
          savedAddressId: addr.id,
          status: "granted",
          countryCode: null,
        });
      },

      clearSavedAddressSelection: () => set({ savedAddressId: null }),

      clear: () =>
        set({
          lat: null,
          lon: null,
          address: null,
          countryCode: null,
          status: "idle",
          savedAddressId: null,
        }),
    }),
    { name: "dilivygo-location", storage: safeStorage }
  )
);
