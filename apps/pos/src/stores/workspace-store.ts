import { create } from "zustand";
import type { Workspace } from "@dilivygo/types";
import { api } from "@/lib/api";

/** Session/API may expose `projectRef` (camelCase) or `project_ref` (snake_case). */
export function staffProjectRef(
  user: { projectRef?: string | null; project_ref?: string | null } | null | undefined
): string | null {
  if (!user) return null;
  const r = user.projectRef ?? user.project_ref;
  return r != null && r !== "" ? String(r) : null;
}

interface WorkspaceState {
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  fetchWorkspace: (projectRef: string | null) => Promise<void>;
  updateWorkspace: (updates: Partial<Workspace>) => Promise<void>;
  setWorkspace: (workspace: Workspace | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  isLoading: false,
  error: null,
  fetchWorkspace: async (projectRef) => {
    if (!projectRef) {
      set({ workspace: null, isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { workspace } = await api.workspace.get(projectRef);
      set({ workspace, isLoading: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch workspace";
      set({ error: errorMessage, isLoading: false });
    }
  },
  updateWorkspace: async (updates: Partial<Workspace>) => {
    const ref = get().workspace?.projectRef;
    if (!ref) return;

    set({ isLoading: true, error: null });
    try {
      const { workspace } = await api.workspace.update(ref, updates);
      set({ workspace, isLoading: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update workspace";
      set({ error: errorMessage, isLoading: false });
      throw err;
    }
  },
  setWorkspace: (workspace) => set({ workspace }),
}));
