/**
 * Anthropic provider adapter.
 *
 * Implements the LLMProvider interface for Anthropic's Messages API.
 * Uses react-native-sse for streaming responses with named SSE events.
 *
 * Key differences from OpenAI:
 * - Uses `x-api-key` header (not `Authorization: Bearer`)
 * - Requires `anthropic-version` header
 * - System prompt is a top-level `system` field, not a message
 * - `max_tokens` is required in every request
 * - SSE uses named events (content_block_delta, message_stop, etc.)
 * - No [DONE] sentinel — stream ends with `message_stop` event
 *
 * Supported models:
 * - Claude Opus 4 (claude-opus-4-6)
 * - Claude Sonnet 4 (claude-sonnet-4-6)
 * - Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
 * - Claude Haiku 3.5 (claude-haiku-4-5-20251001)
 */

import EventSource from "react-native-sse";
import { getApiKey } from "@/src/hooks/useSecureStorage";
import {
  messageForAnthropicError,
  messageFromResponseBody,
  messageForNetworkError,
} from "./errors";
import type {
  LLMProvider,
  ProviderConfig,
  Model,
  Message,
  StreamCallbacks,
  StreamController,
} from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const PROVIDER_ID = "anthropic";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Default max_tokens per model. Anthropic requires this field.
 * We use conservative defaults; the model will stop sooner if the
 * response is shorter.
 */
const DEFAULT_MAX_TOKENS = 8192;

const ANTHROPIC_MODELS: Model[] = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 128000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 3.5",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 64000,
  },
];

// ─── Anthropic SSE event types ───────────────────────────────────────────────

type AnthropicSSEEvents =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "ping"
  | "error";

// ─── Helper: build request body ──────────────────────────────────────────────

function buildRequestBody(
  messages: Pick<Message, "role" | "content">[],
  modelId: string,
): string {
  // Anthropic does NOT accept system messages in the messages array.
  // System prompt goes in the top-level `system` field.
  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return JSON.stringify({
    model: modelId,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: DEFAULT_SYSTEM_PROMPT,
    messages: apiMessages,
    stream: true,
  });
}

// ─── API key validation ──────────────────────────────────────────────────────

/**
 * Validate an Anthropic API key by making a minimal Messages API call.
 * Anthropic has no lightweight /models endpoint, so we send a 1-token
 * request to the cheapest model.
 *
 * Returns `{ valid: true }` or `{ valid: false, error: string }`.
 */
export async function validateAnthropicKey(
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key." };
    }

    // Parse the response body to inspect error details
    const body = await response.json().catch(() => null);
    const errorType = body?.error?.type;
    const errorMsg = body?.error?.message ?? "";

    // A 400 with "credit balance" means the key is valid but the account
    // has a billing issue — treat the key itself as valid.
    if (
      response.status === 400 &&
      errorType === "invalid_request_error" &&
      errorMsg.toLowerCase().includes("credit balance")
    ) {
      return { valid: true };
    }

    const error = messageForAnthropicError(errorType, response.status);
    return { valid: false, error };
  } catch {
    return {
      valid: false,
      error: messageForNetworkError(),
    };
  }
}

// ─── Anthropic Provider class ────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  config: ProviderConfig;

  constructor(isConfigured = false) {
    this.config = {
      id: PROVIDER_ID,
      name: "Anthropic",
      authType: "api-key",
      isConfigured,
      models: ANTHROPIC_MODELS,
    };
  }

  async validateCredentials(): Promise<boolean> {
    const apiKey = await getApiKey(PROVIDER_ID);
    if (!apiKey) {
      this.config.isConfigured = false;
      return false;
    }

    const result = await validateAnthropicKey(apiKey);
    this.config.isConfigured = result.valid;
    return result.valid;
  }

  async listModels(): Promise<Model[]> {
    return ANTHROPIC_MODELS;
  }

  sendMessage(
    messages: Pick<Message, "role" | "content">[],
    modelId: string,
    callbacks: StreamCallbacks,
  ): StreamController {
    let fullText = "";
    let aborted = false;
    let es: InstanceType<typeof EventSource<AnthropicSSEEvents>> | null = null;

    // We need the API key asynchronously, so start the stream inside an IIFE
    (async () => {
      try {
        const apiKey = await getApiKey(PROVIDER_ID);
        if (!apiKey) {
          callbacks.onError(
            new Error(
              "Anthropic API key not configured. Add it in Settings.",
            ),
          );
          return;
        }

        if (aborted) return;

        es = new EventSource<AnthropicSSEEvents>(
          `${ANTHROPIC_API_BASE}/messages`,
          {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
              "content-type": "application/json",
            },
            body: buildRequestBody(messages, modelId),
          },
        );

        // ── Handle text deltas ─────────────────────────────────────────
        es.addEventListener("content_block_delta", (event) => {
          if (aborted) return;

          try {
            const parsed = JSON.parse(event.data ?? "");
            if (
              parsed.delta?.type === "text_delta" &&
              parsed.delta?.text
            ) {
              fullText += parsed.delta.text;
              callbacks.onToken(parsed.delta.text);
            }
          } catch {
            // Ignore malformed chunks
          }
        });

        // ── Stream complete ────────────────────────────────────────────
        es.addEventListener("message_stop", () => {
          if (aborted) return;
          callbacks.onDone(fullText);
          es?.close();
        });

        // ── Ignore pings ───────────────────────────────────────────────
        es.addEventListener("ping", () => {
          // No-op — Anthropic sends periodic pings to keep connection alive
        });

        // ── Stream-level errors from Anthropic ─────────────────────────
        es.addEventListener("error", (event) => {
          if (aborted) return;

          // The error event can come from:
          // 1. Anthropic SSE error event (has event.data with error JSON)
          // 2. react-native-sse connection error (has xhrStatus)
          const errorEvent = event as unknown as {
            data?: string;
            message?: string;
            xhrStatus?: number;
          };

          let errorMessage: string;

          // Try to parse Anthropic's error event data first
          if (errorEvent.data) {
            try {
              const parsed = JSON.parse(errorEvent.data);
              errorMessage = messageForAnthropicError(parsed.error?.type);
            } catch {
              errorMessage = messageForAnthropicError(undefined);
            }
          } else if (errorEvent.xhrStatus) {
            // Connection-level error from react-native-sse
            errorMessage = messageFromResponseBody(
              errorEvent.message,
              errorEvent.xhrStatus,
              "Anthropic",
            );
          } else {
            errorMessage = messageForAnthropicError(undefined);
          }

          callbacks.onError(new Error(errorMessage));
          es?.close();
        });

        // ── No-op handlers for other named events ──────────────────────
        es.addEventListener("message_start", () => {
          // Could extract message metadata here in the future
        });

        es.addEventListener("content_block_start", () => {
          // Could track content block types here in the future
        });

        es.addEventListener("content_block_stop", () => {
          // No-op for now
        });

        es.addEventListener("message_delta", () => {
          // Contains stop_reason and usage — could track in the future
        });

        es.addEventListener("close", () => {
          // No-op: onDone already called from message_stop handler
        });

        // Open the connection
        es.open();
      } catch {
        if (!aborted) {
          callbacks.onError(new Error(messageForNetworkError()));
        }
      }
    })();

    return {
      abort: () => {
        aborted = true;
        es?.close();
      },
    };
  }
}
