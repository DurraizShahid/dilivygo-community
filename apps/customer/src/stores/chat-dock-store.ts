import { create } from "zustand";

export type ChatDockItem = { id: string; title: string };

type State = {
  items: ChatDockItem[];
  activeId: string | null;
  expanded: boolean;
  pin: (item: ChatDockItem) => void;
  unpin: (id: string) => void;
  setActive: (id: string | null) => void;
  setExpanded: (v: boolean) => void;
  toggleExpanded: () => void;
};

export const useChatDockStore = create<State>((set, get) => ({
  items: [],
  activeId: null,
  expanded: false,

  pin: (item) => {
    const { items } = get();
    const exists = items.some((i) => i.id === item.id);
    if (exists) {
      set({ activeId: item.id, expanded: true });
      return;
    }
    set({
      items: [...items, item],
      activeId: item.id,
      expanded: true,
    });
  },

  unpin: (id) => {
    const { items, activeId, expanded } = get();
    const next = items.filter((i) => i.id !== id);
    const nextActive = activeId === id ? next[next.length - 1]?.id ?? null : activeId;
    set({
      items: next,
      activeId: nextActive,
      expanded: next.length === 0 ? false : expanded,
    });
  },

  setActive: (id) => set({ activeId: id }),
  setExpanded: (v) => set({ expanded: v }),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
}));
