/**
 * Google Gemini provider adapter.
 *
 * Implements the LLMProvider interface for Google's Generative Language API.
 * Uses react-native-sse for streaming responses.
 *
 * Key differences from OpenAI/Anthropic:
 * - API key goes in query param (?key=) or `x-goog-api-key` header
 * - Endpoint per model: /v1beta/models/{model}:streamGenerateContent?alt=sse
 * - Request body uses `contents` (not `messages`), roles are "user"/"model" (not "assistant")
 * - System prompt is a top-level `system_instruction` field with `parts` array
 * - SSE data contains `candidates[0].content.parts[0].text`
 * - No [DONE] sentinel — stream ends when the SSE connection closes
 *
 * Supported models:
 * - Gemini 2.5 Pro, Flash, Flash-Lite
 * - Gemini 2.0 Flash, Flash-Lite
 * - Gemini 3.1 Pro (preview), 3 Flash (preview), 3.1 Flash-Lite (preview)
 */

import EventSource from "react-native-sse";
import { getApiKey } from "@/src/hooks/useSecureStorage";
import {
  messageForGoogleError,
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

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const PROVIDER_ID = "google";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

const GOOGLE_MODELS: Model[] = [
  // ── GA models ────────────────────────────────────────────────────────────
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash-Lite",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  // ── Preview models ───────────────────────────────────────────────────────
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite (Preview)",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
];

// ─── Helper: map message role to Gemini role ────────────────────────────────

function toGeminiRole(role: string): string {
  // Gemini uses "model" instead of "assistant"
  return role === "assistant" ? "model" : role;
}

// ─── Helper: build request body ──────────────────────────────────────────────

function buildRequestBody(
  messages: Pick<Message, "role" | "content">[],
): string {
  // Gemini uses `contents` with role "user" or "model"
  const contents = messages.map((m) => ({
    role: toGeminiRole(m.role),
    parts: [{ text: m.content }],
  }));

  return JSON.stringify({
    contents,
    system_instruction: {
      parts: [{ text: DEFAULT_SYSTEM_PROMPT }],
    },
  });
}

// ─── Helper: build streaming URL ─────────────────────────────────────────────

function buildStreamUrl(modelId: string, apiKey: string): string {
  return `${GOOGLE_API_BASE}/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
}

// ─── API key validation ──────────────────────────────────────────────────────

/**
 * Validate a Google AI API key by listing models.
 * Returns `{ valid: true }` or `{ valid: false, error: string }`.
 */
export async function validateGoogleKey(
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${GOOGLE_API_BASE}/models?key=${apiKey}`,
      { method: "GET" },
    );

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 400 || response.status === 403) {
      // Google returns 400 for malformed keys, 403 for invalid/disabled keys
      const body = await response.json().catch(() => null);
      const errorStatus = body?.error?.status;
      const error = messageForGoogleError(errorStatus, response.status);
      return { valid: false, error };
    }

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key." };
    }

    const body = await response.json().catch(() => null);
    const error = messageForGoogleError(body?.error?.status, response.status);
    return { valid: false, error };
  } catch {
    return {
      valid: false,
      error: messageForNetworkError(),
    };
  }
}

// ─── Google Provider class ───────────────────────────────────────────────────

export class GoogleProvider implements LLMProvider {
  config: ProviderConfig;

  constructor(isConfigured = false) {
    this.config = {
      id: PROVIDER_ID,
      name: "Google AI",
      authType: "api-key",
      isConfigured,
      models: GOOGLE_MODELS,
    };
  }

  async validateCredentials(): Promise<boolean> {
    const apiKey = await getApiKey(PROVIDER_ID);
    if (!apiKey) {
      this.config.isConfigured = false;
      return false;
    }

    const result = await validateGoogleKey(apiKey);
    this.config.isConfigured = result.valid;
    return result.valid;
  }

  async listModels(): Promise<Model[]> {
    return GOOGLE_MODELS;
  }

  sendMessage(
    messages: Pick<Message, "role" | "content">[],
    modelId: string,
    callbacks: StreamCallbacks,
  ): StreamController {
    let fullText = "";
    let aborted = false;
    let errored = false;
    let doneFired = false;
    let es: InstanceType<typeof EventSource> | null = null;

    // We need the API key asynchronously, so start the stream inside an IIFE
    (async () => {
      try {
        const apiKey = await getApiKey(PROVIDER_ID);
        if (!apiKey) {
          callbacks.onError(
            new Error("Google AI API key not configured. Add it in Settings."),
          );
          return;
        }

        if (aborted) return;

        const url = buildStreamUrl(modelId, apiKey);

        es = new EventSource(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: buildRequestBody(messages),
        });

        es.addEventListener("message", (event) => {
          if (aborted) return;

          const data = event.data;
          if (!data) return;

          try {
            const parsed = JSON.parse(data);

            // Extract text from Gemini response format
            const text =
              parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              callbacks.onToken(text);
            }

            // Check for finish reason — some responses include it
            const finishReason =
              parsed.candidates?.[0]?.finishReason;
            if (
              finishReason &&
              finishReason !== "STOP" &&
              finishReason !== "FINISH_REASON_UNSPECIFIED"
            ) {
              // Non-normal finish reasons (SAFETY, MAX_TOKENS, etc.)
              // The stream may continue or end — let the close handler deal with it
            }
          } catch {
            // Ignore malformed chunks
          }
        });

        es.addEventListener("error", (event) => {
          if (aborted) return;

          if (event.type === "error") {
            const errorEvent = event as {
              message: string;
              xhrStatus: number;
              xhrState: number;
            };

            // react-native-sse fires error for both LOADING (3) and DONE (4)
            // states. Only process once the full response is available.
            if (
              errorEvent.xhrState !== 4 &&
              errorEvent.xhrState !== undefined
            ) {
              return;
            }

            // Google returns error JSON with a different structure:
            // { error: { code: 400, message: "...", status: "INVALID_ARGUMENT" } }
            const errorMessage = messageFromResponseBody(
              errorEvent.message,
              errorEvent.xhrStatus,
              "Google",
            );

            errored = true;
            callbacks.onError(new Error(errorMessage));
          }

          es?.close();
        });

        es.addEventListener("close", () => {
          // Stream ended — call onDone if we haven't errored or aborted
          if (!aborted && !errored && !doneFired) {
            doneFired = true;
            callbacks.onDone(fullText);
          }
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
