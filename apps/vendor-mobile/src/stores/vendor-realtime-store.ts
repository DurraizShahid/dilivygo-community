import { create } from "zustand";

export type StatusBannerState = { message: string; id: string } | null;

interface VendorRealtimeState {
  flashOrderIds: Record<string, true>;
  statusBanner: StatusBannerState;
  placedBannerDismissed: boolean;
  pendingPushOrderId: string | null;
  addFlashOrderId: (orderId: string) => void;
  removeFlashOrderId: (orderId: string) => void;
  setStatusBanner: (b: StatusBannerState) => void;
  setPlacedBannerDismissed: (v: boolean) => void;
  setPendingPushOrderId: (id: string | null) => void;
}

export const useVendorRealtimeStore = create<VendorRealtimeState>((set) => ({
  flashOrderIds: {},
  statusBanner: null,
  placedBannerDismissed: false,
  pendingPushOrderId: null,

  addFlashOrderId: (orderId) =>
    set((s) => {
      if (s.flashOrderIds[orderId]) return s;
      return { flashOrderIds: { ...s.flashOrderIds, [orderId]: true } };
    }),

  removeFlashOrderId: (orderId) =>
    set((s) => {
      const next = { ...s.flashOrderIds };
      delete next[orderId];
      return { flashOrderIds: next };
    }),

  setStatusBanner: (b) => set({ statusBanner: b }),

  setPlacedBannerDismissed: (v) => set({ placedBannerDismissed: v }),

  setPendingPushOrderId: (id) => set({ pendingPushOrderId: id }),
}));

export function getVendorRealtimeStore() {
  return useVendorRealtimeStore.getState();
}
