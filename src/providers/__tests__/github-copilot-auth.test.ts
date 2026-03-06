/**
 * Unit tests for GitHub Copilot auth module.
 *
 * Tests the OAuth device flow, token polling, JWT exchange,
 * and token lifecycle management.
 */

import * as SecureStore from "expo-secure-store";
import {
  requestDeviceCode,
  pollForToken,
  exchangeForCopilotToken,
  getCopilotToken,
  refreshCopilotToken,
  isSignedIn,
  signOut,
  clearTokenCache,
} from "@/src/providers/github-copilot/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  clearTokenCache();
  // Reset SecureStore mock
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
});

// ─── requestDeviceCode ───────────────────────────────────────────────────────

describe("requestDeviceCode", () => {
  it("returns device code response on success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        user_code: "ABCD-1234",
        device_code: "dc_abc123",
        verification_uri: "https://github.com/login/device",
        interval: 5,
        expires_in: 900,
      }),
    );

    const result = await requestDeviceCode();

    expect(result.user_code).toBe("ABCD-1234");
    expect(result.device_code).toBe("dc_abc123");
    expect(result.verification_uri).toBe("https://github.com/login/device");
    expect(result.interval).toBe(5);
    expect(result.expires_in).toBe(900);
  });

  it("sends correct client_id and scope", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        user_code: "ABCD-1234",
        device_code: "dc_abc123",
        verification_uri: "https://github.com/login/device",
        interval: 5,
        expires_in: 900,
      }),
    );

    await requestDeviceCode();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://github.com/login/device/code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "Iv1.b507a08c87ecfe98",
          scope: "read:user",
        }),
      }),
    );
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(requestDeviceCode()).rejects.toThrow(
      "Failed to request device code (HTTP 500).",
    );
  });

  it("throws on invalid response (missing user_code)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ device_code: "dc_abc123" }),
    );

    await expect(requestDeviceCode()).rejects.toThrow(
      "Invalid response from GitHub device code endpoint.",
    );
  });

  it("uses defaults for optional fields", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        user_code: "XXXX-YYYY",
        device_code: "dc_xyz",
      }),
    );

    const result = await requestDeviceCode();

    expect(result.verification_uri).toBe("https://github.com/login/device");
    expect(result.interval).toBe(5);
    expect(result.expires_in).toBe(900);
  });
});

// ─── pollForToken ────────────────────────────────────────────────────────────

describe("pollForToken", () => {
  it("returns access token on immediate success", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: "gho_test123" }),
    );

    const token = await pollForToken("dc_abc123", 0.01, 10);

    expect(token).toBe("gho_test123");
    // Should persist the token
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "serva_github-copilot_oauth_token",
      "gho_test123",
    );
  });

  it("polls until authorization is granted", async () => {
    // First poll: pending
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "authorization_pending" }),
    );
    // Second poll: success
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: "gho_delayed" }),
    );

    const token = await pollForToken("dc_abc123", 0.01, 10);

    expect(token).toBe("gho_delayed");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws when code expires", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "expired_token" }),
    );

    await expect(pollForToken("dc_abc123", 0.01, 10)).rejects.toThrow(
      "The authorization code has expired. Please try again.",
    );
  });

  it("throws when access is denied", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "access_denied" }),
    );

    await expect(pollForToken("dc_abc123", 0.01, 10)).rejects.toThrow(
      "Authorization was denied.",
    );
  });

  it("can be cancelled via AbortSignal", async () => {
    const controller = new AbortController();

    // Pending forever
    mockFetch.mockResolvedValue(
      jsonResponse({ error: "authorization_pending" }),
    );

    const promise = pollForToken("dc_abc123", 0.01, 60, controller.signal);

    // Abort immediately
    controller.abort();

    await expect(promise).rejects.toThrow("Authorization was cancelled.");
  });

  it("sends correct grant_type in poll request", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ access_token: "gho_test" }),
    );

    await pollForToken("dc_abc123", 0.01, 10);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "Iv1.b507a08c87ecfe98",
          device_code: "dc_abc123",
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }),
    );
  });
});

// ─── exchangeForCopilotToken ─────────────────────────────────────────────────

describe("exchangeForCopilotToken", () => {
  it("returns Copilot JWT on success", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_copilot_123", expires_at: expiresAt }),
    );

    const result = await exchangeForCopilotToken("gho_test123");

    expect(result.token).toBe("jwt_copilot_123");
    expect(result.expires_at).toBe(expiresAt);
  });

  it("sends correct headers including Editor-Version", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_test", expires_at: expiresAt }),
    );

    await exchangeForCopilotToken("gho_test123");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/copilot_internal/v2/token",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "token gho_test123",
          "Editor-Version": "vscode/1.100.0",
          "Copilot-Integration-Id": "vscode-chat",
        }),
      }),
    );
  });

  it("clears stored token on 401 and throws", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    await expect(exchangeForCopilotToken("gho_expired")).rejects.toThrow(
      "GitHub authorization has expired. Please sign in again.",
    );

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "serva_github-copilot_oauth_token",
    );
  });

  it("throws on non-401 HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    await expect(exchangeForCopilotToken("gho_test")).rejects.toThrow(
      "Failed to get Copilot token (HTTP 500).",
    );
  });

  it("throws on invalid response (missing token)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ expires_at: 1234 }));

    await expect(exchangeForCopilotToken("gho_test")).rejects.toThrow(
      "Invalid Copilot token response.",
    );
  });
});

// ─── getCopilotToken ─────────────────────────────────────────────────────────

describe("getCopilotToken", () => {
  it("returns null when no OAuth token is stored", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const token = await getCopilotToken();

    expect(token).toBeNull();
  });

  it("exchanges OAuth token for Copilot JWT", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("gho_stored");
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_fresh", expires_at: expiresAt }),
    );

    const token = await getCopilotToken();

    expect(token).toBe("jwt_fresh");
  });

  it("returns cached token if still valid", async () => {
    // First call: get fresh JWT
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("gho_stored");
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_cached", expires_at: expiresAt }),
    );

    const first = await getCopilotToken();
    expect(first).toBe("jwt_cached");

    // Second call: should use cache, no fetch
    const second = await getCopilotToken();
    expect(second).toBe("jwt_cached");
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch call
  });
});

// ─── refreshCopilotToken ─────────────────────────────────────────────────────

describe("refreshCopilotToken", () => {
  it("clears cache and gets fresh token", async () => {
    // Seed the cache
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("gho_stored");
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_old", expires_at: expiresAt }),
    );
    await getCopilotToken();

    // Now refresh
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_new", expires_at: expiresAt }),
    );

    const token = await refreshCopilotToken();

    expect(token).toBe("jwt_new");
    expect(mockFetch).toHaveBeenCalledTimes(2); // Original + refresh
  });

  it("returns null when no OAuth token stored", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const token = await refreshCopilotToken();

    expect(token).toBeNull();
  });
});

// ─── isSignedIn ──────────────────────────────────────────────────────────────

describe("isSignedIn", () => {
  it("returns false when no token stored", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    expect(await isSignedIn()).toBe(false);
  });

  it("returns true when token is stored", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("gho_exists");
    expect(await isSignedIn()).toBe(true);
  });
});

// ─── signOut ─────────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("clears stored OAuth token", async () => {
    await signOut();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      "serva_github-copilot_oauth_token",
    );
  });

  it("clears cached JWT so subsequent getCopilotToken returns null", async () => {
    // Seed cache
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("gho_stored");
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ token: "jwt_cached", expires_at: expiresAt }),
    );
    await getCopilotToken();

    // Sign out
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await signOut();

    const token = await getCopilotToken();
    expect(token).toBeNull();
  });
});
