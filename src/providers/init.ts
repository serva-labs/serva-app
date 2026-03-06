/**
 * Provider initialization — creates and registers all provider instances.
 *
 * Called once on app startup from the root layout.
 * Each provider checks SecureStore to determine if it's configured.
 */

import { OpenAIProvider } from "./openai";
import { registerProvider } from "./registry";
import { hasCredentials } from "@/src/hooks/useSecureStorage";
import { useProvidersStore } from "@/src/store/providers";
import type { ProviderConfig } from "./types";

let initialized = false;

/**
 * Initialize all providers, check their credential status,
 * and populate the Zustand providers store.
 */
export async function initializeProviders(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Create provider instances
  const openai = new OpenAIProvider();

  // Check which providers have stored credentials
  const openaiConfigured = await hasCredentials("openai");
  openai.config.isConfigured = openaiConfigured;

  // Register in the provider registry
  registerProvider(openai);

  // Sync to Zustand store so UI can react
  const configs: ProviderConfig[] = [openai.config];

  useProvidersStore.getState().setProviders(configs);

  // Set default active provider/model if one is configured
  if (openaiConfigured) {
    useProvidersStore
      .getState()
      .setActiveProviderAndModel("openai", "gpt-4o");
  }
}

/**
 * Reset initialization state (useful for testing).
 */
export function resetProviderInit(): void {
  initialized = false;
}
