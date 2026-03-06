/**
 * Secure storage wrapper for API keys and OAuth tokens.
 *
 * Uses expo-secure-store under the hood (Keychain on iOS, EncryptedSharedPreferences on Android).
 * Provides typed get/set/delete for provider credentials.
 */

import * as SecureStore from "expo-secure-store";

const KEY_PREFIX = "serva_";

function makeKey(providerId: string, suffix: string): string {
  return `${KEY_PREFIX}${providerId}_${suffix}`;
}

// ─── API Key providers (OpenAI, Anthropic, Google) ───────────────────────────

export async function getApiKey(providerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(makeKey(providerId, "api_key"));
}

export async function setApiKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  await SecureStore.setItemAsync(makeKey(providerId, "api_key"), apiKey);
}

export async function deleteApiKey(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(makeKey(providerId, "api_key"));
}

// ─── OAuth providers (GitHub Copilot) ────────────────────────────────────────

export async function getOAuthToken(
  providerId: string,
): Promise<string | null> {
  return SecureStore.getItemAsync(makeKey(providerId, "oauth_token"));
}

export async function setOAuthToken(
  providerId: string,
  token: string,
): Promise<void> {
  await SecureStore.setItemAsync(makeKey(providerId, "oauth_token"), token);
}

export async function deleteOAuthToken(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(makeKey(providerId, "oauth_token"));
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

export async function hasCredentials(providerId: string): Promise<boolean> {
  const apiKey = await getApiKey(providerId);
  const oauthToken = await getOAuthToken(providerId);
  return apiKey !== null || oauthToken !== null;
}

export async function clearAllCredentials(providerId: string): Promise<void> {
  await deleteApiKey(providerId);
  await deleteOAuthToken(providerId);
}
