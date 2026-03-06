/**
 * Providers store — manages provider configurations and active model selection.
 *
 * Tracks which providers are configured, which model is selected,
 * and the available model list per provider.
 */

import { create } from "zustand";
import type { ProviderConfig, Model } from "@/src/providers/types";

interface ProvidersState {
  /** All known provider configurations */
  providers: ProviderConfig[];
  /** Currently selected provider ID */
  activeProviderId: string | null;
  /** Currently selected model ID */
  activeModelId: string | null;

  // Actions
  setProviders: (providers: ProviderConfig[]) => void;
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void;
  setActiveProvider: (providerId: string) => void;
  setActiveModel: (modelId: string) => void;
  setActiveProviderAndModel: (providerId: string, modelId: string) => void;

  // Derived (computed via selectors, not stored)
}

export const useProvidersStore = create<ProvidersState>((set) => ({
  providers: [],
  activeProviderId: null,
  activeModelId: null,

  setProviders: (providers) => set({ providers }),

  updateProvider: (id, updates) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    })),

  setActiveProvider: (providerId) => set({ activeProviderId: providerId }),

  setActiveModel: (modelId) => set({ activeModelId: modelId }),

  setActiveProviderAndModel: (providerId, modelId) =>
    set({ activeProviderId: providerId, activeModelId: modelId }),
}));

// NOTE: Derived selectors (selectConfiguredProviders, selectActiveModel, etc.)
// were removed because they return new object/array references on every call,
// which causes infinite re-render loops when used with Zustand's useStore().
// Instead, use primitive selectors + useMemo in components.
