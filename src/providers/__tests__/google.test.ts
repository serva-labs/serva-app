/**
 * Unit tests for the Google Gemini provider adapter.
 *
 * These tests mock:
 * - expo-secure-store (via jest.setup.js)
 * - react-native-sse (EventSource)
 * - global fetch (for validateGoogleKey)
 *
 * No real API calls are made.
 *
 * Key differences from OpenAI/Anthropic tests:
 * - Google uses a per-model URL with API key in query param
 * - Request body uses `contents` with role "user"/"model", not `messages`
 * - System prompt is a top-level `system_instruction` field
 * - SSE data uses `candidates[0].content.parts[0].text`
 * - No [DONE] sentinel — stream ends via close event
 */

import { GoogleProvider, validateGoogleKey } from "../google";
import * as SecureStore from "expo-secure-store";
import EventSource from "react-native-sse";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;

/**
 * Create a mock EventSource that simulates SSE behavior.
 * Returns the mock instance so tests can control it.
 */
function createMockEventSource() {
  const listeners: Record<string, Function[]> = {};

  const mockInstance = {
    addEventListener: jest.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    removeEventListener: jest.fn(),
    removeAllEventListeners: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    dispatch: jest.fn(),
    // Test helper: fire a named event
    _emit(event: string, data: any) {
      (listeners[event] || []).forEach((cb) => cb(data));
    },
  };

  (EventSource as unknown as jest.Mock).mockImplementation(() => mockInstance);

  return mockInstance;
}

// ─── Tests: validateGoogleKey ────────────────────────────────────────────────

describe("validateGoogleKey", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns valid: true for a 200 response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          models: [{ name: "models/gemini-2.5-flash" }],
        }),
    });

    const result = await validateGoogleKey("AIzaTestKey123");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify the validation request URL includes the API key
    expect(global.fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?key=AIzaTestKey123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns valid: false with message for 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: {
            code: 401,
            message: "Request had invalid authentication credentials.",
            status: "UNAUTHENTICATED",
          },
        }),
    });

    const result = await validateGoogleKey("bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API key.");
  });

  it("returns valid: false with message for 403 (PERMISSION_DENIED)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: {
            code: 403,
            message: "Generative Language API has not been used in project 123",
            status: "PERMISSION_DENIED",
          },
        }),
    });

    const result = await validateGoogleKey("AIzaValidButNoAccess");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not authorized");
  });

  it("returns valid: false with message for 400 (INVALID_ARGUMENT)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: {
            code: 400,
            message: "API key not valid.",
            status: "INVALID_ARGUMENT",
          },
        }),
    });

    const result = await validateGoogleKey("totally-invalid");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid API key format");
  });

  it("returns valid: false with message for 429 (RESOURCE_EXHAUSTED)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: {
            code: 429,
            message: "Quota exceeded",
            status: "RESOURCE_EXHAUSTED",
          },
        }),
    });

    const result = await validateGoogleKey("AIzaTestKey");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Quota exceeded");
  });

  it("returns valid: false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const result = await validateGoogleKey("AIzaTestKey");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Network error. Check your internet connection and try again.",
    );
  });

  it("handles non-JSON error responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await validateGoogleKey("AIzaTestKey");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("experiencing issues");
  });

  it("falls back to HTTP status message for unknown error status", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          error: {
            code: 500,
            message: "Internal error",
            status: "UNKNOWN_STATUS",
          },
        }),
    });

    const result = await validateGoogleKey("AIzaTestKey");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("experiencing issues");
  });
});

// ─── Tests: GoogleProvider ───────────────────────────────────────────────────

describe("GoogleProvider", () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    provider = new GoogleProvider();
    jest.clearAllMocks();
  });

  describe("config", () => {
    it("has correct provider ID and name", () => {
      expect(provider.config.id).toBe("google");
      expect(provider.config.name).toBe("Google AI");
      expect(provider.config.authType).toBe("api-key");
    });

    it("has the full model set", () => {
      const modelIds = provider.config.models.map((m) => m.id);
      // GA models
      expect(modelIds).toContain("gemini-2.5-pro");
      expect(modelIds).toContain("gemini-2.5-flash");
      expect(modelIds).toContain("gemini-2.5-flash-lite");
      expect(modelIds).toContain("gemini-2.0-flash");
      expect(modelIds).toContain("gemini-2.0-flash-lite");
      // Preview models
      expect(modelIds).toContain("gemini-3.1-pro-preview");
      expect(modelIds).toContain("gemini-3-flash-preview");
      expect(modelIds).toContain("gemini-3.1-flash-lite-preview");
      expect(modelIds).toHaveLength(8);
    });

    it("starts as not configured", () => {
      expect(provider.config.isConfigured).toBe(false);
    });
  });

  describe("validateCredentials", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("returns false when no API key is stored", async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const result = await provider.validateCredentials();
      expect(result).toBe(false);
      expect(provider.config.isConfigured).toBe(false);
    });

    it("returns true when a valid key is stored", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaValidKey");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ models: [{ name: "models/gemini-2.5-flash" }] }),
      });

      const result = await provider.validateCredentials();
      expect(result).toBe(true);
      expect(provider.config.isConfigured).toBe(true);
    });

    it("returns false when key is invalid", async () => {
      mockGetItemAsync.mockResolvedValue("bad-key");
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { code: 401, message: "Invalid", status: "UNAUTHENTICATED" },
          }),
      });

      const result = await provider.validateCredentials();
      expect(result).toBe(false);
      expect(provider.config.isConfigured).toBe(false);
    });
  });

  describe("listModels", () => {
    it("returns the hardcoded model list", async () => {
      const models = await provider.listModels();
      expect(models).toHaveLength(8);
      expect(models[0].providerId).toBe("google");
    });
  });

  describe("sendMessage", () => {
    it("calls EventSource with correct URL including API key and model", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hello" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(EventSource).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=AIzaTestKey",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify body structure — system_instruction is top-level, contents uses "user"/"model" roles
      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.system_instruction).toEqual({
        parts: [{ text: "You are a helpful assistant." }],
      });
      expect(body.contents).toEqual([
        { role: "user", parts: [{ text: "Hello" }] },
      ]);

      expect(mockES.open).toHaveBeenCalled();
    });

    it("streams tokens via message events with Gemini response format", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate Gemini streaming events
      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello" }],
                role: "model",
              },
            },
          ],
        }),
      });

      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: " world" }],
                role: "model",
              },
            },
          ],
        }),
      });

      // Stream ends via close event (no [DONE] sentinel)
      mockES._emit("close", {});

      expect(callbacks.onToken).toHaveBeenCalledTimes(2);
      expect(callbacks.onToken).toHaveBeenCalledWith("Hello");
      expect(callbacks.onToken).toHaveBeenCalledWith(" world");
      expect(callbacks.onDone).toHaveBeenCalledWith("Hello world");
    });

    it("calls onError when no API key is stored", async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("not configured"),
        }),
      );
    });

    it("calls onError on SSE error event with raw Google message", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate connection-level error with JSON response body
      mockES._emit("error", {
        type: "error",
        message: JSON.stringify({
          error: {
            code: 400,
            message: "API key not valid. Please pass a valid API key.",
            status: "INVALID_ARGUMENT",
          },
        }),
        xhrState: 4,
        xhrStatus: 400,
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Google: API key not valid. Please pass a valid API key.",
        }),
      );
    });

    it("calls onError on connection-level error (xhrStatus)", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate a connection-level 500 error with no parseable JSON
      mockES._emit("error", {
        type: "error",
        message: "Internal Server Error",
        xhrState: 4,
        xhrStatus: 500,
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("experiencing issues"),
        }),
      );
    });

    it("ignores error events with xhrState !== 4", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // xhrState 3 = LOADING — should be ignored
      mockES._emit("error", {
        type: "error",
        message: "partial error",
        xhrState: 3,
        xhrStatus: 400,
      });

      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("supports abort via StreamController", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      const controller = provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      controller.abort();

      // After abort, tokens should be ignored
      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "ignored" }],
                role: "model",
              },
            },
          ],
        }),
      });

      // Close should not fire onDone after abort
      mockES._emit("close", {});

      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(callbacks.onDone).not.toHaveBeenCalled();
      expect(mockES.close).toHaveBeenCalled();
    });

    it("handles malformed JSON in SSE data gracefully", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Send malformed data — should not crash
      mockES._emit("message", { data: "not valid json{{{" });

      // Send valid data after
      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "OK" }],
                role: "model",
              },
            },
          ],
        }),
      });

      mockES._emit("close", {});

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onToken).toHaveBeenCalledWith("OK");
      expect(callbacks.onDone).toHaveBeenCalledWith("OK");
    });

    it("maps assistant role to model role in request body", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
          { role: "user", content: "And 3+3?" },
        ],
        "gemini-2.5-pro",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.contents).toHaveLength(3);
      expect(body.contents[0]).toEqual({
        role: "user",
        parts: [{ text: "What is 2+2?" }],
      });
      // "assistant" should be mapped to "model"
      expect(body.contents[1]).toEqual({
        role: "model",
        parts: [{ text: "4" }],
      });
      expect(body.contents[2]).toEqual({
        role: "user",
        parts: [{ text: "And 3+3?" }],
      });
      expect(body.system_instruction).toEqual({
        parts: [{ text: "You are a helpful assistant." }],
      });
    });

    it("does not call onDone after an error", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Error fires first
      mockES._emit("error", {
        type: "error",
        message: JSON.stringify({
          error: { code: 400, message: "Bad request", status: "INVALID_ARGUMENT" },
        }),
        xhrState: 4,
        xhrStatus: 400,
      });

      // Close fires after error — should NOT trigger onDone
      mockES._emit("close", {});

      expect(callbacks.onError).toHaveBeenCalledTimes(1);
      expect(callbacks.onDone).not.toHaveBeenCalled();
    });

    it("fires onDone only once even if close fires multiple times", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Hello" }], role: "model" } },
          ],
        }),
      });

      // Close fires twice (edge case)
      mockES._emit("close", {});
      mockES._emit("close", {});

      expect(callbacks.onDone).toHaveBeenCalledTimes(1);
      expect(callbacks.onDone).toHaveBeenCalledWith("Hello");
    });

    it("handles empty candidates gracefully", async () => {
      mockGetItemAsync.mockResolvedValue("AIzaTestKey");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gemini-2.5-flash",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Empty candidates — should not crash
      mockES._emit("message", {
        data: JSON.stringify({ candidates: [] }),
      });

      // Missing content field
      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [{ finishReason: "SAFETY" }],
        }),
      });

      // Valid data after
      mockES._emit("message", {
        data: JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "Safe response" }], role: "model" } },
          ],
        }),
      });

      mockES._emit("close", {});

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onToken).toHaveBeenCalledTimes(1);
      expect(callbacks.onToken).toHaveBeenCalledWith("Safe response");
      expect(callbacks.onDone).toHaveBeenCalledWith("Safe response");
    });
  });
});
