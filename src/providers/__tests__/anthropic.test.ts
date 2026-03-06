/**
 * Unit tests for the Anthropic provider adapter.
 *
 * These tests mock:
 * - expo-secure-store (via jest.setup.js)
 * - react-native-sse (EventSource)
 * - global fetch (for validateAnthropicKey)
 *
 * No real API calls are made.
 *
 * Key difference from OpenAI tests:
 * Anthropic uses named SSE events (content_block_delta, message_stop, etc.)
 * instead of a single "message" event with [DONE] sentinel.
 */

import { AnthropicProvider, validateAnthropicKey } from "../anthropic";
import * as SecureStore from "expo-secure-store";
import EventSource from "react-native-sse";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;

/**
 * Create a mock EventSource that simulates SSE behavior with named events.
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

// ─── Tests: validateAnthropicKey ─────────────────────────────────────────────

describe("validateAnthropicKey", () => {
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
          id: "msg_test",
          type: "message",
          content: [{ type: "text", text: "H" }],
        }),
    });

    const result = await validateAnthropicKey("sk-ant-test-key");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify the validation request uses correct headers
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test-key",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        }),
      }),
    );

    // Verify the validation request uses cheapest model with max_tokens: 1
    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.max_tokens).toBe(1);
  });

  it("returns valid: false with message for 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: {
            type: "authentication_error",
            message: "invalid x-api-key",
          },
        }),
    });

    const result = await validateAnthropicKey("sk-ant-bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API key.");
  });

  it("returns valid: false with message for 429", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: {
            type: "rate_limit_error",
            message: "Rate limit exceeded",
          },
        }),
    });

    const result = await validateAnthropicKey("sk-ant-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Rate limited");
  });

  it("returns valid: false with message for 529 (overloaded)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 529,
      json: () =>
        Promise.resolve({
          error: {
            type: "overloaded_error",
            message: "Overloaded",
          },
        }),
    });

    const result = await validateAnthropicKey("sk-ant-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("overloaded");
  });

  it("returns valid: false on network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const result = await validateAnthropicKey("sk-ant-test-key");
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

    const result = await validateAnthropicKey("sk-ant-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Anthropic is experiencing issues. Please try again later.",
    );
  });

  it("handles non-JSON error responses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await validateAnthropicKey("sk-ant-test-key");
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      "Anthropic is experiencing issues. Please try again later.",
    );
  });

  it("treats 400 with credit balance error as valid key", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
          },
        }),
    });

    const result = await validateAnthropicKey("sk-ant-valid-but-no-credits");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ─── Tests: AnthropicProvider ────────────────────────────────────────────────

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider();
    jest.clearAllMocks();
  });

  describe("config", () => {
    it("has correct provider ID and name", () => {
      expect(provider.config.id).toBe("anthropic");
      expect(provider.config.name).toBe("Anthropic");
      expect(provider.config.authType).toBe("api-key");
    });

    it("has the flagship model set", () => {
      const modelIds = provider.config.models.map((m) => m.id);
      expect(modelIds).toContain("claude-opus-4-6");
      expect(modelIds).toContain("claude-sonnet-4-6");
      expect(modelIds).toContain("claude-sonnet-4-5-20250929");
      expect(modelIds).toContain("claude-haiku-4-5-20251001");
      expect(modelIds).toHaveLength(4);
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
      mockGetItemAsync.mockResolvedValue("sk-ant-valid-key");
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "msg_test", type: "message" }),
      });

      const result = await provider.validateCredentials();
      expect(result).toBe(true);
      expect(provider.config.isConfigured).toBe(true);
    });

    it("returns false when key is invalid", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-invalid-key");
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { type: "authentication_error", message: "Invalid" },
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
      expect(models).toHaveLength(4);
      expect(models[0].providerId).toBe("anthropic");
    });
  });

  describe("sendMessage", () => {
    it("calls EventSource with correct URL and Anthropic headers", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hello" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(EventSource).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test-key",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          }),
        }),
      );

      // Verify body structure — system is top-level, not in messages
      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.model).toBe("claude-sonnet-4-6");
      expect(body.stream).toBe(true);
      expect(body.max_tokens).toBe(8192);
      expect(body.system).toBe("You are a helpful assistant.");
      expect(body.messages).toEqual([
        { role: "user", content: "Hello" },
      ]);
      // System prompt should NOT be in the messages array
      expect(
        body.messages.some((m: any) => m.role === "system"),
      ).toBe(false);

      expect(mockES.open).toHaveBeenCalled();
    });

    it("streams tokens via named content_block_delta events", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate Anthropic streaming events
      mockES._emit("message_start", {
        data: JSON.stringify({
          type: "message_start",
          message: { id: "msg_test", type: "message", role: "assistant" },
        }),
      });

      mockES._emit("content_block_start", {
        data: JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      });

      // Streaming text deltas
      mockES._emit("content_block_delta", {
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        }),
      });

      mockES._emit("content_block_delta", {
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: " world" },
        }),
      });

      mockES._emit("content_block_stop", {
        data: JSON.stringify({
          type: "content_block_stop",
          index: 0,
        }),
      });

      // Stream complete
      mockES._emit("message_stop", {
        data: JSON.stringify({ type: "message_stop" }),
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
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("not configured"),
        }),
      );
    });

    it("calls onError on SSE error event with raw Anthropic message", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate Anthropic error event with JSON data
      mockES._emit("error", {
        data: JSON.stringify({
          type: "error",
          error: {
            type: "authentication_error",
            message: "invalid x-api-key",
          },
        }),
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Anthropic: invalid x-api-key",
        }),
      );
    });

    it("calls onError on SSE error event with rate limit raw message", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      mockES._emit("error", {
        data: JSON.stringify({
          type: "error",
          error: {
            type: "rate_limit_error",
            message: "Rate limit exceeded",
          },
        }),
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Anthropic: Rate limit exceeded",
        }),
      );
    });

    it("calls onError on connection-level error (xhrStatus)", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-bad-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Simulate a connection-level 401 error (no data field)
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

    it("supports abort via StreamController", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      const controller = provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      controller.abort();

      // After abort, tokens should be ignored
      mockES._emit("content_block_delta", {
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "ignored" },
        }),
      });

      mockES._emit("message_stop", {
        data: JSON.stringify({ type: "message_stop" }),
      });

      expect(callbacks.onToken).not.toHaveBeenCalled();
      expect(callbacks.onDone).not.toHaveBeenCalled();
      expect(mockES.close).toHaveBeenCalled();
    });

    it("handles malformed JSON in SSE data gracefully", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Send malformed data — should not crash
      mockES._emit("content_block_delta", {
        data: "not valid json{{{",
      });

      // Send valid data after
      mockES._emit("content_block_delta", {
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "OK" },
        }),
      });

      mockES._emit("message_stop", {
        data: JSON.stringify({ type: "message_stop" }),
      });

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onToken).toHaveBeenCalledWith("OK");
      expect(callbacks.onDone).toHaveBeenCalledWith("OK");
    });

    it("ignores ping events", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      // Send a ping — should be silently ignored
      mockES._emit("ping", {
        data: JSON.stringify({ type: "ping" }),
      });

      mockES._emit("content_block_delta", {
        data: JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        }),
      });

      mockES._emit("message_stop", {
        data: JSON.stringify({ type: "message_stop" }),
      });

      expect(callbacks.onToken).toHaveBeenCalledWith("Hello");
      expect(callbacks.onDone).toHaveBeenCalledWith("Hello");
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it("includes multiple conversation messages in request", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
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
        "claude-opus-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      const callArgs = (EventSource as unknown as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe("claude-opus-4-6");
      // Messages should NOT include system prompt — it's a top-level field
      expect(body.messages).toHaveLength(3);
      expect(body.messages[0]).toEqual({
        role: "user",
        content: "What is 2+2?",
      });
      expect(body.messages[1]).toEqual({
        role: "assistant",
        content: "4",
      });
      expect(body.messages[2]).toEqual({
        role: "user",
        content: "And 3+3?",
      });
      expect(body.system).toBe("You are a helpful assistant.");
    });

    it("handles overloaded error from SSE", async () => {
      mockGetItemAsync.mockResolvedValue("sk-ant-test-key");
      const mockES = createMockEventSource();

      const callbacks = {
        onToken: jest.fn(),
        onDone: jest.fn(),
        onError: jest.fn(),
      };

      provider.sendMessage(
        [{ role: "user", content: "Hi" }],
        "claude-sonnet-4-6",
        callbacks,
      );

      await new Promise((r) => setTimeout(r, 10));

      mockES._emit("error", {
        data: JSON.stringify({
          type: "error",
          error: {
            type: "overloaded_error",
            message: "Overloaded",
          },
        }),
      });

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Anthropic: Overloaded",
        }),
      );
    });
  });
});
