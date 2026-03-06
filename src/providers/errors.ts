/**
 * Error handling for provider API errors.
 *
 * Strategy for streaming/chat errors:
 * - Show the raw `error.message` from the API prefixed with the provider name.
 *   These messages are already well-written and actionable.
 * - `sanitizeErrorMessage` is the final guard against JSON blobs, stack traces,
 *   and XHR internals reaching the UI.
 *
 * Strategy for validation errors (key save in Settings):
 * - Use per-provider mapped messages for a tighter UX.
 *
 * Provider adapters call `messageFromResponseBody` for streaming errors.
 * Validation functions call `messageForOpenAIError` / `messageForAnthropicError` directly.
 * useChat calls `sanitizeErrorMessage` as the last line of defense.
 */

// ─── HTTP status → fallback message ─────────────────────────────────────────

/**
 * Common HTTP error messages shared across all providers.
 * Used as fallback when the API response has no readable error.message.
 */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please try again.",
  401: "Invalid API key. Check your key in Settings.",
  403: "Access denied. Your API key may not have permission for this model.",
  404: "The requested model was not found. Try selecting a different model.",
  408: "The request timed out. Please try again.",
  413: "The message is too long. Try shortening your conversation.",
  422: "The request could not be processed. Please try again.",
  500: "The service is experiencing issues. Please try again later.",
  502: "The service is temporarily unavailable. Please try again later.",
  503: "The service is temporarily unavailable. Please try again later.",
};

// ─── Provider-specific error code mapping (used for validation only) ─────────

/**
 * Known OpenAI error codes (from response body `error.code`).
 * Used by validateOpenAIKey in Settings — NOT for streaming errors.
 */
const OPENAI_ERROR_CODES: Record<string, string> = {
  insufficient_quota:
    "Quota exceeded. Check your OpenAI plan and billing details.",
  rate_limit_exceeded:
    "Rate limited by OpenAI. Please wait and try again.",
  model_not_found:
    "This model is not available. Try selecting a different model.",
  context_length_exceeded:
    "Your conversation is too long for this model. Start a new chat or try a model with a larger context window.",
  invalid_api_key:
    "Invalid API key. Check your key in Settings.",
  billing_hard_limit_reached:
    "Your OpenAI spending limit has been reached. Check your billing settings.",
  server_error:
    "OpenAI is experiencing issues. Please try again later.",
};

/**
 * Known Anthropic error types (from response body `error.type`).
 * Used by validateAnthropicKey in Settings — NOT for streaming errors.
 */
const ANTHROPIC_ERROR_TYPES: Record<string, string> = {
  authentication_error:
    "Invalid API key. Check your key in Settings.",
  rate_limit_error:
    "Rate limited by Anthropic. Please wait and try again.",
  overloaded_error:
    "Anthropic is overloaded. Please try again later.",
  invalid_request_error:
    "The request was invalid. Please try again.",
  permission_error:
    "Access denied. Your API key may not have permission for this action.",
  not_found_error:
    "The requested model was not found. Try selecting a different model.",
  api_error:
    "Anthropic is experiencing issues. Please try again later.",
};

// ─── Public API ──────────────────────────────────────────────────────────────

export type ProviderName = "OpenAI" | "Anthropic" | "Google" | "GitHub Copilot";

/**
 * Map an HTTP status code to a fallback message.
 * Accepts optional provider name for contextual messages.
 */
export function messageForHttpStatus(
  status: number,
  provider?: ProviderName,
): string {
  const providerLabel = provider ?? "The service";

  if (status === 429) {
    return `Rate limited by ${providerLabel}. Please wait and try again.`;
  }
  if (status === 529) {
    return `${providerLabel} is overloaded. Please try again later.`;
  }
  if (status === 500 || status === 502 || status === 503) {
    return `${providerLabel} is experiencing issues. Please try again later.`;
  }

  return (
    HTTP_STATUS_MESSAGES[status] ??
    `Something went wrong (HTTP ${status}). Please try again.`
  );
}

/**
 * Map an OpenAI error code to a user-friendly message.
 * Used for validation (Settings) only.
 */
export function messageForOpenAIError(
  code: string | null | undefined,
  httpStatus?: number,
): string {
  if (code && OPENAI_ERROR_CODES[code]) {
    return OPENAI_ERROR_CODES[code];
  }
  if (httpStatus) {
    return messageForHttpStatus(httpStatus, "OpenAI");
  }
  return "Something went wrong with OpenAI. Please try again.";
}

/**
 * Map an Anthropic error type to a user-friendly message.
 * Used for validation (Settings) only.
 */
export function messageForAnthropicError(
  errorType: string | null | undefined,
  httpStatus?: number,
): string {
  if (errorType && ANTHROPIC_ERROR_TYPES[errorType]) {
    return ANTHROPIC_ERROR_TYPES[errorType];
  }
  if (httpStatus) {
    return messageForHttpStatus(httpStatus, "Anthropic");
  }
  return "Something went wrong with Anthropic. Please try again.";
}

/**
 * Map a GitHub Copilot error code to a user-friendly message.
 * Used for Copilot-specific cases (401 = re-auth needed).
 */
export function messageForCopilotError(
  code: string | null | undefined,
  httpStatus?: number,
): string {
  if (httpStatus === 401) {
    return "GitHub Copilot: Authorization has expired. Please sign in again from Settings.";
  }
  // For other codes, fall through to messageFromResponseBody's raw message logic
  if (httpStatus) {
    return messageForHttpStatus(httpStatus, "GitHub Copilot");
  }
  return "Something went wrong with GitHub Copilot. Please try again.";
}

/**
 * Extract a displayable error message from a raw API response body.
 *
 * Strategy: show the provider's own `error.message` prefixed with the
 * provider name. These messages are already human-readable and actionable.
 * Falls back to HTTP status mapping when no readable message is found.
 */
export function messageFromResponseBody(
  rawBody: string | undefined | null,
  httpStatus: number,
  provider: ProviderName,
): string {
  if (!rawBody) {
    return messageForHttpStatus(httpStatus, provider);
  }

  try {
    const parsed = JSON.parse(rawBody);
    const error = parsed?.error;
    const rawMessage: string | undefined = error?.message;

    // Special case: Copilot 401 always means re-auth
    if (provider === "GitHub Copilot" && httpStatus === 401) {
      return messageForCopilotError(error?.code, httpStatus);
    }

    // If the API gave us a readable message, show it with the provider prefix
    if (rawMessage && typeof rawMessage === "string" && rawMessage.length > 0) {
      return `${provider}: ${rawMessage}`;
    }
  } catch {
    // Not JSON — fall through to generic message
  }

  return messageForHttpStatus(httpStatus, provider);
}

/**
 * Map a network-level error (fetch failure, DNS, timeout, etc.)
 * to a user-friendly message. Never exposes raw JS error strings.
 */
export function messageForNetworkError(): string {
  return "Network error. Check your internet connection and try again.";
}

/**
 * Final guard: sanitize any error message before displaying to the user.
 * Catches raw JSON strings, overly technical messages, and unknown formats.
 *
 * Used by useChat as the last line of defense before rendering.
 */
export function sanitizeErrorMessage(message: string): string {
  // Reject raw JSON strings
  if (message.startsWith("{") || message.startsWith("[")) {
    return "Something went wrong. Please try again.";
  }

  // Reject messages that look like stack traces or internal errors
  if (
    message.includes("TypeError:") ||
    message.includes("SyntaxError:") ||
    message.includes("ReferenceError:") ||
    message.includes("at ") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ENOTFOUND") ||
    message.includes("xhr")
  ) {
    return "Something went wrong. Please try again.";
  }

  return message;
}
