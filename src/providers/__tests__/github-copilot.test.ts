/**
 * Unit tests for GitHub Copilot provider adapter.
 *
 * Tests the LLMProvider implementation: config, credentials,
 * model listing, and SSE streaming with JWT auth.
 */

import EventSource from "react-native-sse";
import { GitHubCopilotProvider } from "@/src/providers/github-copilot";
import * as auth from "@/src/providers/github-copilot/auth";

// ─── Mock the auth module ────────────────────────────────────────────────────

jest.mock("@/src/providers/github-copilot/auth", () => ({
  getCopilotToken: jest.fn(),
  refreshCopilotToken: jest.fn(),
}));

const mockGetCopilotToken = auth.getCopilotToken as jest.MockedFunction<
  typeof auth.getCopilotToken
>;
const mockRefreshCopilotToken = auth.refreshCopilotToken as jest.MockedFunction<
  typeof auth.refreshCopilotToken
>;

// ─── Mock EventSource ────────────────────────────────────────────────────────

const MockEventSource = EventSource as jest.MockedClass<typeof EventSource>;

let esInstance: {
  addEventListener: jest.Mock;
  open: jest.Mock;
  close: jest.Mock;
  listeners: Record<string, (event: unknown) => void>;
};

beforeEach(() => {
  jest.clearAllMocks();

  esInstance = {
    addEventListener: jest.fn((event: string, handler: (e: unknown) => void) => {
      esInstance.listeners[event] = handler;
    }),
    open: jest.fn(),
    close: jest.fn(),
    listeners: {},
  };

  MockEventSource.mockImplementation(() => esInstance as unknown as InstanceType<typeof EventSource>);
});

// ─── Config ──────────────────────────────────────────────────────────────────

describe("GitHubCopilotProvider config", () => {
  it("has correct provider metadata", () => {
    const provider = new GitHubCopilotProvider();

    expect(provider.config.id).toBe("github-copilot");
    expect(provider.config.name).toBe("GitHub Copilot");
    expect(provider.config.authType).toBe("oauth");
    expect(provider.config.isConfigured).toBe(false);
  });

  it("accepts initial isConfigured state", () => {
    const provider = new GitHubCopilotProvider(true);
    expect(provider.config.isConfigured).toBe(true);
  });

  it("exposes all Copilot models", () => {
    const provider = new GitHubCopilotProvider();
    const modelIds = provider.config.models.map((m) => m.id);

    expect(modelIds).toContain("gpt-4o");
    expect(modelIds).toContain("gpt-4.1");
    expect(modelIds).toContain("claude-sonnet-4");
    expect(modelIds).toContain("claude-3.5-sonnet");
    expect(modelIds).toContain("claude-3.7-sonnet");
    expect(modelIds).toContain("gemini-2.0-flash");
    expect(modelIds).toContain("gemini-2.5-pro");
    expect(modelIds).toContain("o1");
    expect(modelIds).toContain("o3-mini");
    expect(modelIds).toContain("o4-mini");
    expect(provider.config.models).toHaveLength(10);
  });

  it("all models have github-copilot as providerId", () => {
    const provider = new GitHubCopilotProvider();
    provider.config.models.forEach((m) => {
      expect(m.providerId).toBe("github-copilot");
    });
  });
});

// ─── validateCredentials ─────────────────────────────────────────────────────

describe("validateCredentials", () => {
  it("returns true when token exchange succeeds", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_valid");

    const provider = new GitHubCopilotProvider();
    const result = await provider.validateCredentials();

    expect(result).toBe(true);
    expect(provider.config.isConfigured).toBe(true);
  });

  it("returns false when no token available", async () => {
    mockGetCopilotToken.mockResolvedValue(null);

    const provider = new GitHubCopilotProvider(true);
    const result = await provider.validateCredentials();

    expect(result).toBe(false);
    expect(provider.config.isConfigured).toBe(false);
  });

  it("returns false on token exchange error", async () => {
    mockGetCopilotToken.mockRejectedValue(new Error("Auth expired"));

    const provider = new GitHubCopilotProvider(true);
    const result = await provider.validateCredentials();

    expect(result).toBe(false);
    expect(provider.config.isConfigured).toBe(false);
  });
});

// ─── listModels ──────────────────────────────────────────────────────────────

describe("listModels", () => {
  it("returns the static model list", async () => {
    const provider = new GitHubCopilotProvider();
    const models = await provider.listModels();

    expect(models).toHaveLength(10);
    expect(models[0].id).toBe("gpt-4o");
  });
});

// ─── sendMessage ─────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  const messages = [{ role: "user" as const, content: "Hello" }];
  const modelId = "gpt-4o";

  it("calls onError when no Copilot token available", async () => {
    mockGetCopilotToken.mockResolvedValue(null);

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    // Wait for the async IIFE
    await new Promise((r) => setTimeout(r, 10));

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not connected"),
      }),
    );
  });

  it("opens EventSource with correct URL and headers", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test_123");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    expect(MockEventSource).toHaveBeenCalledWith(
      "https://api.githubcopilot.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt_test_123",
          "Editor-Version": "vscode/1.100.0",
          "Copilot-Integration-Id": "vscode-chat",
        }),
      }),
    );

    expect(esInstance.open).toHaveBeenCalled();
  });

  it("includes system prompt in request body", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    const callArgs = MockEventSource.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);

    expect(body.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(true);
  });

  it("streams tokens from message events", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // Simulate SSE messages
    esInstance.listeners["message"]({
      data: JSON.stringify({
        choices: [{ delta: { content: "Hello" }, finish_reason: null }],
      }),
    });

    esInstance.listeners["message"]({
      data: JSON.stringify({
        choices: [{ delta: { content: " world" }, finish_reason: null }],
      }),
    });

    expect(callbacks.onToken).toHaveBeenCalledWith("Hello");
    expect(callbacks.onToken).toHaveBeenCalledWith(" world");
  });

  it("calls onDone with full text on [DONE] message", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // Send tokens then [DONE]
    esInstance.listeners["message"]({
      data: JSON.stringify({
        choices: [{ delta: { content: "Hi" } }],
      }),
    });
    esInstance.listeners["message"]({ data: "[DONE]" });

    expect(callbacks.onDone).toHaveBeenCalledWith("Hi");
    expect(esInstance.close).toHaveBeenCalled();
  });

  it("handles error events with user-friendly messages", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // Simulate a 429 error
    esInstance.listeners["error"]({
      type: "error",
      message: JSON.stringify({
        error: { code: "rate_limit_exceeded", message: "Rate limited" },
      }),
      xhrStatus: 429,
      xhrState: 4,
    });

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Rate limited"),
      }),
    );
  });

  it("retries with refreshed token on 401 error", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_expired");
    mockRefreshCopilotToken.mockResolvedValue("jwt_fresh");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // Simulate a 401 error
    esInstance.listeners["error"]({
      type: "error",
      message: "Unauthorized",
      xhrStatus: 401,
      xhrState: 4,
    });

    // Wait for retry
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRefreshCopilotToken).toHaveBeenCalled();
    // Should create a new EventSource with fresh token
    expect(MockEventSource).toHaveBeenCalledTimes(2);
  });

  it("reports auth expired when refresh returns null on 401", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_expired");
    mockRefreshCopilotToken.mockResolvedValue(null);

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    esInstance.listeners["error"]({
      type: "error",
      message: "Unauthorized",
      xhrStatus: 401,
      xhrState: 4,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("sign in again"),
      }),
    );
  });

  it("supports abort", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    const controller = provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    controller.abort();

    // After abort, events should be ignored
    esInstance.listeners["message"]?.({
      data: JSON.stringify({
        choices: [{ delta: { content: "ignored" } }],
      }),
    });

    expect(callbacks.onToken).not.toHaveBeenCalled();
    expect(esInstance.close).toHaveBeenCalled();
  });

  it("ignores xhrState !== 4 error events", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // xhrState 3 (LOADING) should be ignored
    esInstance.listeners["error"]({
      type: "error",
      message: "partial",
      xhrStatus: 500,
      xhrState: 3,
    });

    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("handles malformed JSON in message data gracefully", async () => {
    mockGetCopilotToken.mockResolvedValue("jwt_test");

    const callbacks = {
      onToken: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    const provider = new GitHubCopilotProvider(true);
    provider.sendMessage(messages, modelId, callbacks);

    await new Promise((r) => setTimeout(r, 10));

    // Malformed data should not throw
    esInstance.listeners["message"]({ data: "not json{" });

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onToken).not.toHaveBeenCalled();
  });
});
