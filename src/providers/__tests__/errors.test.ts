/**
 * Unit tests for the shared error handling utility.
 *
 * Strategy:
 * - Streaming/chat errors show the raw API error.message prefixed with
 *   the provider name (via messageFromResponseBody).
 * - Validation errors (Settings) use per-provider mapped messages
 *   (messageForOpenAIError, messageForAnthropicError).
 * - sanitizeErrorMessage is the final guard in useChat.
 */

import {
  messageForHttpStatus,
  messageForOpenAIError,
  messageForAnthropicError,
  messageForCopilotError,
  messageFromResponseBody,
  messageForNetworkError,
  sanitizeErrorMessage,
} from "../errors";

// ─── messageForHttpStatus ────────────────────────────────────────────────────

describe("messageForHttpStatus", () => {
  it("returns provider-specific 429 message", () => {
    expect(messageForHttpStatus(429, "OpenAI")).toContain("Rate limited by OpenAI");
    expect(messageForHttpStatus(429, "Anthropic")).toContain("Rate limited by Anthropic");
  });

  it("returns generic 429 message without provider", () => {
    expect(messageForHttpStatus(429)).toContain("Rate limited by The service");
  });

  it("returns overloaded message for 529", () => {
    expect(messageForHttpStatus(529, "Anthropic")).toContain("overloaded");
  });

  it("returns server error for 500/502/503", () => {
    expect(messageForHttpStatus(500, "OpenAI")).toContain("experiencing issues");
    expect(messageForHttpStatus(502, "Anthropic")).toContain("experiencing issues");
    expect(messageForHttpStatus(503)).toContain("experiencing issues");
  });

  it("returns known messages for common HTTP codes", () => {
    expect(messageForHttpStatus(400)).toContain("invalid");
    expect(messageForHttpStatus(401)).toContain("Invalid API key");
    expect(messageForHttpStatus(403)).toContain("permission");
    expect(messageForHttpStatus(404)).toContain("not found");
    expect(messageForHttpStatus(408)).toContain("timed out");
    expect(messageForHttpStatus(413)).toContain("too long");
  });

  it("returns generic message for unknown status codes", () => {
    const msg = messageForHttpStatus(418);
    expect(msg).toContain("Something went wrong");
    expect(msg).toContain("418");
  });
});

// ─── messageForOpenAIError (validation only) ─────────────────────────────────

describe("messageForOpenAIError", () => {
  it("maps known OpenAI error codes", () => {
    expect(messageForOpenAIError("insufficient_quota")).toContain("Quota exceeded");
    expect(messageForOpenAIError("rate_limit_exceeded")).toContain("Rate limited");
    expect(messageForOpenAIError("model_not_found")).toContain("not available");
    expect(messageForOpenAIError("context_length_exceeded")).toContain("too long");
    expect(messageForOpenAIError("invalid_api_key")).toContain("Invalid API key");
    expect(messageForOpenAIError("billing_hard_limit_reached")).toContain("spending limit");
    expect(messageForOpenAIError("server_error")).toContain("issues");
  });

  it("falls back to HTTP status message for unknown codes", () => {
    expect(messageForOpenAIError("unknown_code", 429)).toContain("Rate limited");
    expect(messageForOpenAIError("unknown_code", 500)).toContain("experiencing issues");
  });

  it("falls back to generic message when no code or status", () => {
    expect(messageForOpenAIError(null)).toContain("Something went wrong");
    expect(messageForOpenAIError(undefined)).toContain("Something went wrong");
  });
});

// ─── messageForAnthropicError (validation only) ──────────────────────────────

describe("messageForAnthropicError", () => {
  it("maps known Anthropic error types", () => {
    expect(messageForAnthropicError("authentication_error")).toContain("Invalid API key");
    expect(messageForAnthropicError("rate_limit_error")).toContain("Rate limited");
    expect(messageForAnthropicError("overloaded_error")).toContain("overloaded");
    expect(messageForAnthropicError("invalid_request_error")).toContain("invalid");
    expect(messageForAnthropicError("permission_error")).toContain("permission");
    expect(messageForAnthropicError("not_found_error")).toContain("not found");
    expect(messageForAnthropicError("api_error")).toContain("issues");
  });

  it("falls back to HTTP status message for unknown types", () => {
    expect(messageForAnthropicError("unknown_type", 429)).toContain("Rate limited");
    expect(messageForAnthropicError("unknown_type", 529)).toContain("overloaded");
  });

  it("falls back to generic message when no type or status", () => {
    expect(messageForAnthropicError(null)).toContain("Something went wrong");
    expect(messageForAnthropicError(undefined)).toContain("Something went wrong");
  });
});

// ─── messageForCopilotError ──────────────────────────────────────────────────

describe("messageForCopilotError", () => {
  it("returns re-auth message for 401", () => {
    expect(messageForCopilotError(null, 401)).toContain("Authorization has expired");
    expect(messageForCopilotError(null, 401)).toContain("sign in again");
  });

  it("falls back to HTTP status for other codes", () => {
    expect(messageForCopilotError(null, 429)).toContain("Rate limited");
    expect(messageForCopilotError(null, 500)).toContain("experiencing issues");
  });

  it("falls back to generic message when no status", () => {
    expect(messageForCopilotError(null)).toContain("Something went wrong");
  });
});

// ─── messageFromResponseBody ─────────────────────────────────────────────────

describe("messageFromResponseBody", () => {
  it("shows raw API message prefixed with provider name (OpenAI)", () => {
    const body = JSON.stringify({
      error: { code: "insufficient_quota", message: "You exceeded your current quota" },
    });
    const result = messageFromResponseBody(body, 429, "OpenAI");
    expect(result).toBe("OpenAI: You exceeded your current quota");
  });

  it("shows raw API message prefixed with provider name (Anthropic)", () => {
    const body = JSON.stringify({
      error: { type: "rate_limit_error", message: "Rate limit exceeded" },
    });
    const result = messageFromResponseBody(body, 429, "Anthropic");
    expect(result).toBe("Anthropic: Rate limit exceeded");
  });

  it("shows raw Anthropic credit balance message with prefix", () => {
    const body = JSON.stringify({
      error: {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    });
    const result = messageFromResponseBody(body, 400, "Anthropic");
    expect(result).toBe(
      "Anthropic: Your credit balance is too low to access the Anthropic API.",
    );
  });

  it("shows raw Copilot message with prefix", () => {
    const body = JSON.stringify({
      error: { message: "Model not available" },
    });
    const result = messageFromResponseBody(body, 404, "GitHub Copilot");
    expect(result).toBe("GitHub Copilot: Model not available");
  });

  it("uses special Copilot 401 message instead of raw message", () => {
    const body = JSON.stringify({
      error: { message: "Unauthorized" },
    });
    const result = messageFromResponseBody(body, 401, "GitHub Copilot");
    expect(result).toContain("Authorization has expired");
    expect(result).toContain("sign in again");
  });

  it("falls back to HTTP status when body is null", () => {
    expect(messageFromResponseBody(null, 500, "OpenAI")).toContain("experiencing issues");
  });

  it("falls back to HTTP status when body is not JSON", () => {
    expect(messageFromResponseBody("not json", 401, "Anthropic")).toContain(
      "Invalid API key",
    );
  });

  it("falls back to HTTP status when body has no error.message field", () => {
    const body = JSON.stringify({ status: "error" });
    expect(messageFromResponseBody(body, 503, "OpenAI")).toContain("experiencing issues");
  });

  it("falls back to HTTP status when error.message is empty string", () => {
    const body = JSON.stringify({ error: { message: "" } });
    expect(messageFromResponseBody(body, 429, "OpenAI")).toContain("Rate limited");
  });
});

// ─── messageForNetworkError ──────────────────────────────────────────────────

describe("messageForNetworkError", () => {
  it("returns a user-friendly network error message", () => {
    const msg = messageForNetworkError();
    expect(msg).toContain("Network error");
    expect(msg).toContain("internet connection");
  });
});

// ─── sanitizeErrorMessage ────────────────────────────────────────────────────

describe("sanitizeErrorMessage", () => {
  it("passes through clean user-friendly messages", () => {
    expect(sanitizeErrorMessage("Rate limited by OpenAI. Please wait and try again.")).toBe(
      "Rate limited by OpenAI. Please wait and try again.",
    );
  });

  it("passes through provider-prefixed raw messages", () => {
    expect(
      sanitizeErrorMessage("OpenAI: You exceeded your current quota"),
    ).toBe("OpenAI: You exceeded your current quota");
  });

  it("rejects raw JSON strings", () => {
    expect(sanitizeErrorMessage('{"error":"bad"}')).toBe(
      "Something went wrong. Please try again.",
    );
    expect(sanitizeErrorMessage('[{"error":"bad"}]')).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("rejects stack traces", () => {
    expect(sanitizeErrorMessage("TypeError: Cannot read property 'foo' of undefined")).toBe(
      "Something went wrong. Please try again.",
    );
    expect(sanitizeErrorMessage("Error at Object.<anonymous> (file.js:10:5)")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("rejects network-level error strings", () => {
    expect(sanitizeErrorMessage("ECONNREFUSED 127.0.0.1:443")).toBe(
      "Something went wrong. Please try again.",
    );
    expect(sanitizeErrorMessage("ETIMEDOUT")).toBe(
      "Something went wrong. Please try again.",
    );
    expect(sanitizeErrorMessage("ENOTFOUND api.openai.com")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("rejects xhr-related messages", () => {
    expect(sanitizeErrorMessage("xhr error: readyState 4")).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
