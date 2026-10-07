import { create } from "zustand";

/** Search query for the home restaurant list — driven by the shell nav + hero. */
export const useBrowseSearchStore = create<{
  query: string;
  /** Incremented when the user asks to focus browse search (shell search button). */
  focusNonce: number;
  setQuery: (query: string) => void;
  requestBrowseSearchFocus: () => void;
}>((set, get) => ({
  query: "",
  focusNonce: 0,
  setQuery: (query) => set({ query }),
  requestBrowseSearchFocus: () => set({ focusNonce: get().focusNonce + 1 }),
}));
