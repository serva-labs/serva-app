/**
 * Provider initialization — creates and registers all provider instances.
 *
 * Called once on app startup from the root layout.
 * Each provider checks SecureStore to determine if it's configured.
 */

import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GitHubCopilotProvider } from "./github-copilot";
import { GoogleProvider } from "./google";
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
  const copilot = new GitHubCopilotProvider();
  const google = new GoogleProvider();

  // Check which providers have stored credentials
  const openaiConfigured = await hasCredentials("openai");
  openai.config.isConfigured = openaiConfigured;

  const anthropicConfigured = await hasCredentials("anthropic");
  anthropic.config.isConfigured = anthropicConfigured;

  const copilotConfigured = await hasCredentials("github-copilot");
  copilot.config.isConfigured = copilotConfigured;

  const googleConfigured = await hasCredentials("google");
  google.config.isConfigured = googleConfigured;

  // Register in the provider registry
  registerProvider(openai);
  registerProvider(anthropic);
  registerProvider(copilot);
  registerProvider(google);

  // Sync to Zustand store so UI can react
  const configs: ProviderConfig[] = [
    openai.config,
    anthropic.config,
    copilot.config,
    google.config,
  ];

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
  } else if (copilotConfigured) {
    useProvidersStore
      .getState()
      .setActiveProviderAndModel("github-copilot", "gpt-4o");
  } else if (googleConfigured) {
    useProvidersStore
      .getState()
      .setActiveProviderAndModel("google", "gemini-2.5-flash");
  }
}

/**
 * Reset initialization state (useful for testing).
 */
export function resetProviderInit(): void {
  initialized = false;
}
