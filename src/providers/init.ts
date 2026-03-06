/**
 * Provider initialization — creates and registers all provider instances.
 *
 * Called once on app startup from the root layout.
 * Each provider checks SecureStore to determine if it's configured.
 */

import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
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
  const anthropic = new AnthropicProvider();

  // Check which providers have stored credentials
  const openaiConfigured = await hasCredentials("openai");
  openai.config.isConfigured = openaiConfigured;

  const anthropicConfigured = await hasCredentials("anthropic");
  anthropic.config.isConfigured = anthropicConfigured;

  // Register in the provider registry
  registerProvider(openai);
  registerProvider(anthropic);

  // Sync to Zustand store so UI can react
  const configs: ProviderConfig[] = [openai.config, anthropic.config];

  useProvidersStore.getState().setProviders(configs);

  // Set default active provider/model if one is configured
  if (openaiConfigured) {
    useProvidersStore
      .getState()
      .setActiveProviderAndModel("openai", "gpt-4o");
  } else if (anthropicConfigured) {
    useProvidersStore
      .getState()
      .setActiveProviderAndModel("anthropic", "claude-sonnet-4-6");
  }
}

/**
 * Reset initialization state (useful for testing).
 */
export function resetProviderInit(): void {
  initialized = false;
}
