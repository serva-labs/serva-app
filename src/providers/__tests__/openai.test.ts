/**
 * Unit tests for the OpenAI provider adapter.
 *
 * These tests mock:
 * - expo-secure-store (via jest.setup.js)
 * - react-native-sse (EventSource)
 * - global fetch (for validateOpenAIKey)
 *
 * No real API calls are made.
 */

import { OpenAIProvider, validateOpenAIKey } from "../openai";
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
    // Test helper: fire an event
    _emit(event: string, data: any) {
      (listeners[event] || []).forEach((cb) => cb(data));
    },
  };

  (EventSource as unknown as jest.Mock).mockImplementation(() => mockInstance);

  return mockInstance;
}

// ─── Tests: validateOpenAIKey ────────────────────────────────────────────────

describe("validateOpenAIKey", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns valid: true for a 200 response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid: false with message for 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: { message: "Incorrect API key provided" },
        }),
    });

    const result = await validateOpenAIKey("sk-bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API key.");
  });

  it("returns valid: false with rate limit message for 429", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" },
        }),
    });

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Rate limited");
  });

  it("returns valid: false with quota message for 429 insufficient_quota", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: {
            message: "You exceeded your current quota",
            type: "insufficient_quota",
            code: "insufficient_quota",
          },
        }),
    });

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Quota exceeded");
  });

  it("returns valid: false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Network error. Check your internet connection and try again.",
    );
  });

  it("returns user-friendly message for unknown status (no raw API text)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          error: { message: "Internal server error" },
        }),
    });

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "OpenAI is experiencing issues. Please try again later.",
    );
  });

  it("handles non-JSON error responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await validateOpenAIKey("sk-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "OpenAI is experiencing issues. Please try again later.",
    );
  });
});

// ─── Tests: OpenAIProvider ───────────────────────────────────────────────────

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
    jest.clearAllMocks();
  });

  describe("config", () => {
    it("has correct provider ID and name", () => {
      expect(provider.config.id).toBe("openai");
      expect(provider.config.name).toBe("OpenAI");
      expect(provider.config.authType).toBe("api-key");
    });

    it("has the flagship model set", () => {
      const modelIds = provider.config.models.map((m) => m.id);
      expect(modelIds).toContain("gpt-4o");
      expect(modelIds).toContain("gpt-4o-mini");
      expect(modelIds).toContain("gpt-4.1");
      expect(modelIds).toContain("gpt-4.1-mini");
      expect(modelIds).toContain("gpt-4.1-nano");
      expect(modelIds).toContain("o4-mini");
      expect(modelIds).toContain("o3-mini");
      expect(modelIds).toHaveLength(7);
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
      mockGetItemAsync.mockResolvedValue("sk-valid-key");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await provider.validateCredentials();
      expect(result).toBe(true);
      expect(provider.config.isConfigured).toBe(true);
    });

    it("returns false when key is invalid", async () => {
      mockGetItemAsync.mockResolvedValue("sk-invalid-key");
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: "Invalid" } }),
      });

      const result = await provider.validateCredentials();
      expect(result).toBe(false);
      expect(provider.config.isConfigured).toBe(false);
    });
  });

  describe("listModels", () => {
    it("returns the hardcoded model list", async () => {
      const models = await provider.listModels();
      expect(models).toHaveLength(7);
      expect(models[0].providerId).toBe("openai");
    });
  });

  describe("sendMessage", () => {
    it("calls EventSource with correct URL and headers", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hello" }],
        "gpt-4o",
        callbacks,
      );

      // Wait for async IIFE to run
      await new Promise((r) => setTimeout(r, 10));

      expect(EventSource).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-key",
            "Content-Type": "application/json",
          }),
        }),
      );

      // Verify body contains system prompt and user message
      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.model).toBe("gpt-4o");
      expect(body.stream).toBe(true);
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant.",
      });
      expect(body.messages[1]).toEqual({
        role: "user",
        content: "Hello",
      });

      expect(mockES.open).toHaveBeenCalled();
    });

    it("streams tokens via onToken callback", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate streaming tokens
      mockES._emit("message", {
        type: "message",
        data: JSON.stringify({
          choices: [{ delta: { content: "Hello" }, finish_reason: null }],
        }),
      });

      mockES._emit("message", {
        type: "message",
        data: JSON.stringify({
          choices: [{ delta: { content: " world" }, finish_reason: null }],
        }),
      });

      // Simulate stream end
      mockES._emit("message", {
        type: "message",
        data: "[DONE]",
      });

      expect(callbacks.onToken).toHaveBeenCalledTimes(2);
      expect(callbacks.onToken).toHaveBeenCalledWith("Hello");
      expect(callbacks.onToken).toHaveBeenCalledWith(" world");
      expect(callbacks.onDone).toHaveBeenCalledWith("Hello world");
      expect(mockES.close).toHaveBeenCalled();
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
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("not configured"),
        }),
      );
    });

    it("calls onError on SSE error event (401)", async () => {
      mockGetItemAsync.mockResolvedValue("sk-bad-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate a 401 error (xhrState 4 = DONE)
      mockES._emit("error", {
        type: "error",
        message: "Unauthorized",
        xhrState: 4,
        xhrStatus: 401,
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Invalid API key"),
        }),
      );
    });

    it("calls onError on SSE error event (429 rate limit)", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      mockES._emit("error", {
        type: "error",
        message: JSON.stringify({
          error: { message: "Rate limit exceeded", type: "rate_limit", code: "rate_limit_exceeded" },
        }),
        xhrState: 4,
        xhrStatus: 429,
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Rate limited"),
        }),
      );
    });

    it("calls onError with quota message on SSE 429 insufficient_quota", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      mockES._emit("error", {
        type: "error",
        message: JSON.stringify({
          error: {
            message: "You exceeded your current quota",
            type: "insufficient_quota",
            code: "insufficient_quota",
          },
        }),
        xhrState: 4,
        xhrStatus: 429,
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Quota exceeded"),
        }),
      );
    });

    it("supports abort via StreamController", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      const controller = provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      controller.abort();

      // After abort, tokens should be ignored
      mockES._emit("message", {
        type: "message",
        data: JSON.stringify({
          choices: [{ delta: { content: "ignored" }, finish_reason: null }],
        }),
      });

      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(mockES.close).toHaveBeenCalled();
    });

    it("handles malformed JSON in SSE data gracefully", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "gpt-4o",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Send malformed data — should not crash
      mockES._emit("message", {
        type: "message",
        data: "not valid json{{{",
      });

      // Send valid data after
      mockES._emit("message", {
        type: "message",
        data: JSON.stringify({
          choices: [{ delta: { content: "OK" }, finish_reason: null }],
        }),
      });

      mockES._emit("message", {
        type: "message",
        data: "[DONE]",
      });

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onToken).toHaveBeenCalledWith("OK");
      expect(callbacks.onDone).toHaveBeenCalledWith("OK");
    });

    it("includes multiple conversation messages in request", async () => {
      mockGetItemAsync.mockResolvedValue("sk-test-key");
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
        "gpt-4.1",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe("gpt-4.1");
      expect(body.messages).toHaveLength(4); // system + 3 user messages
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1]).toEqual({ role: "user", content: "What is 2+2?" });
      expect(body.messages[2]).toEqual({ role: "assistant", content: "4" });
      expect(body.messages[3]).toEqual({ role: "user", content: "And 3+3?" });
    });
  });
});
