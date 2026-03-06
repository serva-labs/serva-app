/**
 * GitHub Copilot OAuth device flow authentication.
 *
 * Implements the full device authorization flow:
 * 1. Request a device code from GitHub
 * 2. User enters code at github.com/login/device
 * 3. Poll for the OAuth token (gho_* token)
 * 4. Exchange gho_* token for a short-lived Copilot JWT
 * 5. Auto-refresh JWT when it expires
 *
 * The gho_* OAuth token is persisted in expo-secure-store.
 * The Copilot JWT is kept in memory only (short-lived, ~30 min).
 *
 * Uses VS Code's client_id (same approach as OpenCode, Cline, Continue).
 */

import {
  getOAuthToken,
  setOAuthToken,
  deleteOAuthToken,
} from "@/src/hooks/useSecureStorage";

// ─── Constants ───────────────────────────────────────────────────────────────

/** VS Code's GitHub OAuth client_id — standard for Copilot IDE integrations */
const CLIENT_ID = "Iv1.b507a08c87ecfe98";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL =
  "https://api.github.com/copilot_internal/v2/token";
const PROVIDER_ID = "github-copilot";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  /** The code the user must enter at github.com/login/device */
  user_code: string;
  /** The device code used for polling */
  device_code: string;
  /** URL where user enters the code */
  verification_uri: string;
  /** Polling interval in seconds */
  interval: number;
  /** Code expiry in seconds */
  expires_in: number;
}

export interface CopilotToken {
  /** The short-lived JWT for Copilot API calls */
  token: string;
  /** Unix timestamp (seconds) when the token expires */
  expires_at: number;
}

type PollResult =
  | { status: "success"; access_token: string }
  | { status: "pending" }
  | { status: "expired" }
  | { status: "error"; error: string };

// ─── In-memory JWT cache ─────────────────────────────────────────────────────

let cachedCopilotToken: CopilotToken | null = null;

// ─── Device code request ─────────────────────────────────────────────────────

/**
 * Request a device code from GitHub to start the OAuth device flow.
 * The returned `user_code` should be shown to the user along with
 * the `verification_uri` (github.com/login/device).
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to request device code (HTTP ${response.status}).`,
    );
  }

  const data = await response.json();

  if (!data.user_code || !data.device_code) {
    throw new Error("Invalid response from GitHub device code endpoint.");
  }

  return {
    user_code: data.user_code,
    device_code: data.device_code,
    verification_uri: data.verification_uri ?? "https://github.com/login/device",
    interval: data.interval ?? 5,
    expires_in: data.expires_in ?? 900,
  };
}

// ─── Token polling ───────────────────────────────────────────────────────────

/**
 * Single poll attempt to exchange the device code for an access token.
 * Returns the poll state — callers loop on "pending".
 */
async function pollOnce(deviceCode: string): Promise<PollResult> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  const data = await response.json();

  // GitHub returns 200 even for pending/error states — check the error field
  if (data.access_token) {
    return { status: "success", access_token: data.access_token };
  }

  switch (data.error) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      // Caller should increase interval
      return { status: "pending" };
    case "expired_token":
      return { status: "expired" };
    case "access_denied":
      return { status: "error", error: "Authorization was denied." };
    default:
      return {
        status: "error",
        error: data.error_description ?? "Authorization failed.",
      };
  }
}

/**
 * Poll GitHub for the OAuth access token until the user authorizes
 * or the code expires. Resolves with the `gho_*` token.
 *
 * @param deviceCode - The device_code from requestDeviceCode()
 * @param interval - Polling interval in seconds
 * @param expiresIn - Timeout in seconds
 * @param signal - Optional AbortSignal to cancel polling
 */
export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;
  let currentInterval = interval;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error("Authorization was cancelled.");
    }

    // Wait for the polling interval
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, currentInterval * 1000);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Authorization was cancelled."));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    if (signal?.aborted) {
      throw new Error("Authorization was cancelled.");
    }

    const result = await pollOnce(deviceCode);

    switch (result.status) {
      case "success":
        // Persist the gho_* token
        await setOAuthToken(PROVIDER_ID, result.access_token);
        return result.access_token;
      case "pending":
        // GitHub may ask us to slow down — add 5s when that happens
        // (handled implicitly since slow_down returns "pending")
        currentInterval = Math.max(currentInterval, interval);
        continue;
      case "expired":
        throw new Error(
          "The authorization code has expired. Please try again.",
        );
      case "error":
        throw new Error(result.error);
    }
  }

  throw new Error("The authorization code has expired. Please try again.");
}

// ─── Copilot JWT exchange ────────────────────────────────────────────────────

/**
 * Exchange a GitHub OAuth token (gho_*) for a short-lived Copilot JWT.
 * The JWT is used to authenticate against the Copilot API.
 */
export async function exchangeForCopilotToken(
  oauthToken: string,
): Promise<CopilotToken> {
  const response = await fetch(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      Authorization: `token ${oauthToken}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.100.0",
      "Editor-Plugin-Version": "copilot-chat/0.25.0",
      "Copilot-Integration-Id": "vscode-chat",
      "User-Agent": "Serva/1.0.0",
    },
  });

  if (response.status === 401) {
    // OAuth token is invalid/revoked — clear it
    await deleteOAuthToken(PROVIDER_ID);
    cachedCopilotToken = null;
    throw new Error(
      "GitHub authorization has expired. Please sign in again.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to get Copilot token (HTTP ${response.status}).`,
    );
  }

  const data = await response.json();

  if (!data.token || !data.expires_at) {
    throw new Error("Invalid Copilot token response.");
  }

  const copilotToken: CopilotToken = {
    token: data.token,
    expires_at: data.expires_at,
  };

  // Cache in memory
  cachedCopilotToken = copilotToken;

  return copilotToken;
}

// ─── Token management ────────────────────────────────────────────────────────

/**
 * Get a valid Copilot JWT token. Uses the in-memory cache if the token
 * is still valid, otherwise exchanges the stored OAuth token for a new one.
 *
 * Returns null if no OAuth token is stored (user not signed in).
 */
export async function getCopilotToken(): Promise<string | null> {
  // Check if cached token is still valid (with 60s buffer)
  if (
    cachedCopilotToken &&
    cachedCopilotToken.expires_at > Date.now() / 1000 + 60
  ) {
    return cachedCopilotToken.token;
  }

  // Need a fresh JWT — get the stored OAuth token
  const oauthToken = await getOAuthToken(PROVIDER_ID);
  if (!oauthToken) {
    return null;
  }

  const copilotToken = await exchangeForCopilotToken(oauthToken);
  return copilotToken.token;
}

/**
 * Force-refresh the Copilot JWT (e.g., after a 401 from the Copilot API).
 * Clears the in-memory cache and re-exchanges.
 *
 * Returns null if no OAuth token is stored.
 */
export async function refreshCopilotToken(): Promise<string | null> {
  cachedCopilotToken = null;

  const oauthToken = await getOAuthToken(PROVIDER_ID);
  if (!oauthToken) {
    return null;
  }

  const copilotToken = await exchangeForCopilotToken(oauthToken);
  return copilotToken.token;
}

/**
 * Check if the user has a stored GitHub OAuth token (signed in).
 */
export async function isSignedIn(): Promise<boolean> {
  const token = await getOAuthToken(PROVIDER_ID);
  return token !== null;
}

/**
 * Sign out — clear the stored OAuth token and cached JWT.
 */
export async function signOut(): Promise<void> {
  await deleteOAuthToken(PROVIDER_ID);
  cachedCopilotToken = null;
}

/**
 * Clear the in-memory JWT cache (useful for testing).
 */
export function clearTokenCache(): void {
  cachedCopilotToken = null;
}
