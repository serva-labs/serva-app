/**
 * User-friendly error mapping for provider API errors.
 *
 * All error messages that reach the user MUST go through this module.
 * Raw API responses, JSON blobs, and JS runtime errors should never
 * be shown directly — they're mapped to plain-language messages here.
 *
 * Provider adapters call these helpers instead of constructing error
 * strings inline. useChat uses `sanitizeErrorMessage` as a final guard.
 */

// ─── HTTP status → user-friendly message ─────────────────────────────────────

/**
 * Common HTTP error messages shared across all providers.
 * Provider-specific overrides can be layered on top.
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

// ─── Provider-specific error code mapping ────────────────────────────────────

/**
 * Known OpenAI error codes (from response body `error.code`).
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
 * Map an HTTP status code to a user-friendly message.
 * Accepts optional provider name for contextual messages.
 */
export function messageForHttpStatus(
  status: number,
  provider?: ProviderName,
): string {
  const providerLabel = provider ?? "The service";

  // Provider-specific overrides
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
 * Map an OpenAI error code (from response `error.code`) to a user-friendly message.
 * Falls back to the HTTP status message if the code is unknown.
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
 * Map an Anthropic error type (from response `error.type`) to a user-friendly message.
 * Falls back to the HTTP status message if the type is unknown.
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
 * Safely extract a user-friendly message from a raw error body string.
 * Tries to parse JSON and map known error codes/types.
 * Never returns raw API text — always falls back to a generic message.
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

    if (provider === "OpenAI") {
      return messageForOpenAIError(error?.code, httpStatus);
    }
    if (provider === "Anthropic") {
      return messageForAnthropicError(error?.type, httpStatus);
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
