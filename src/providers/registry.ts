/**
 * Provider registry — singleton map of provider ID → LLMProvider instance.
 *
 * Phase 1 ships with an empty registry. Each provider implementation
 * (Phase 2+) will call `registerProvider()` at import time.
 */

import type { LLMProvider } from "./types";

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.config.id, provider);
}

export function getProvider(id: string): LLMProvider | undefined {
  return providers.get(id);
}

export function getAllProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

export function getConfiguredProviders(): LLMProvider[] {
  return getAllProviders().filter((p) => p.config.isConfigured);
}
