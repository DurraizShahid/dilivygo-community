import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import type { CustomerAddress } from "@dilivygo/types";
import { api } from "@/lib/api";
import {
  customerAddressHeaderLine,
  formatCustomerAddressLine,
} from "@/lib/customer-address";

const PLUS_CODE_PREFIX_RE = /^([0-9A-Z]{4,6}\+[0-9A-Z]{2,4})(?:,)?\s*/i;

interface LocationState {
  lat: number | null;
  lon: number | null;
  address: string | null;
  countryCode: string | null;
  status: "idle" | "loading" | "granted" | "denied";
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
        void (async () => {
          set({
            status: "loading",
            address: null,
            countryCode: null,
            savedAddressId: null,
          });

          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== Location.PermissionStatus.GRANTED) {
            set({ status: "denied", lat: null, lon: null, address: null, countryCode: null });
            return;
          }

          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            set({ lat, lon, status: "granted" });

            try {
              const geo = await api.public.reverseGeocode(lat, lon);
              if (geo?.countryCode) {
                set({ countryCode: geo.countryCode });
              }
              if (geo && typeof geo.address === "string") {
                const cleaned = geo.address.replace(PLUS_CODE_PREFIX_RE, "").trim();
                if (cleaned) set({ address: cleaned });
              }
            } catch {
              /* coordinates still useful */
            }
          } catch {
            set({ status: "denied", address: null, countryCode: null });
          }
        })();
      },

      applySavedAddress: async (addr) => {
        const line = formatCustomerAddressLine(addr);
        let lat = addr.lat ?? null;
        let lon = addr.lon ?? null;
        if (lat == null || lon == null) {
          const geo = await api.public.geocode(line);
          if (geo.lat == null || geo.lon == null) {
            throw new Error("Could not find that address on the map");
          }
          lat = geo.lat;
          lon = geo.lon;
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
    {
      name: "dilivygo-location-mobile",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      partialize: (s) => ({
        lat: s.lat,
        lon: s.lon,
        address: s.address,
        countryCode: s.countryCode,
        status: s.status,
        savedAddressId: s.savedAddressId,
      }),
    }
  )
);
