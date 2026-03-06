/**
 * OpenAI provider adapter.
 *
 * Implements the LLMProvider interface for OpenAI's Chat Completions API.
 * Uses react-native-sse for streaming responses.
 *
 * Supported models (flagship set):
 * - GPT-4o, GPT-4o mini
 * - GPT-4.1, GPT-4.1 mini, GPT-4.1 nano
 * - o4-mini, o3-mini
 */

import EventSource from "react-native-sse";
import { getApiKey } from "@/src/hooks/useSecureStorage";
import {
  messageForOpenAIError,
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

const OPENAI_API_BASE = "https://api.openai.com/v1";
const PROVIDER_ID = "openai";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

const OPENAI_MODELS: Model[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    providerId: PROVIDER_ID,
    contextWindow: 128000,
    maxTokens: 16384,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    providerId: PROVIDER_ID,
    contextWindow: 128000,
    maxTokens: 16384,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    providerId: PROVIDER_ID,
    contextWindow: 1047576,
    maxTokens: 32768,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    providerId: PROVIDER_ID,
    contextWindow: 1047576,
    maxTokens: 32768,
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 nano",
    providerId: PROVIDER_ID,
    contextWindow: 1047576,
    maxTokens: 32768,
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 100000,
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 100000,
  },
];

// ─── Helper: build request body ──────────────────────────────────────────────

function buildRequestBody(
  messages: Pick<Message, "role" | "content">[],
  modelId: string,
): string {
  const apiMessages = [
    { role: "system" as const, content: DEFAULT_SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  return JSON.stringify({
    model: modelId,
    messages: apiMessages,
    stream: true,
  });
}

// ─── API key validation ──────────────────────────────────────────────────────

/**
 * Validate an OpenAI API key by calling the models endpoint.
 * Returns `{ valid: true }` or `{ valid: false, error: string }`.
 */
export async function validateOpenAIKey(
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${OPENAI_API_BASE}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: "Invalid API key." };
    }

    const body = await response.json().catch(() => null);
    const error = messageForOpenAIError(body?.error?.code, response.status);
    return { valid: false, error };
  } catch {
    return {
      valid: false,
      error: messageForNetworkError(),
    };
  }
}

// ─── OpenAI Provider class ───────────────────────────────────────────────────

export class OpenAIProvider implements LLMProvider {
  config: ProviderConfig;

  constructor(isConfigured = false) {
    this.config = {
      id: PROVIDER_ID,
      name: "OpenAI",
      authType: "api-key",
      isConfigured,
      models: OPENAI_MODELS,
    };
  }

  async validateCredentials(): Promise<boolean> {
    const apiKey = await getApiKey(PROVIDER_ID);
    if (!apiKey) {
      this.config.isConfigured = false;
      return false;
    }

    const result = await validateOpenAIKey(apiKey);
    this.config.isConfigured = result.valid;
    return result.valid;
  }

  async listModels(): Promise<Model[]> {
    return OPENAI_MODELS;
  }

  sendMessage(
    messages: Pick<Message, "role" | "content">[],
    modelId: string,
    callbacks: StreamCallbacks,
  ): StreamController {
    let fullText = "";
    let aborted = false;
    let es: InstanceType<typeof EventSource> | null = null;

    // We need the API key asynchronously, so start the stream inside an IIFE
    (async () => {
      try {
        const apiKey = await getApiKey(PROVIDER_ID);
        if (!apiKey) {
          callbacks.onError(
            new Error("OpenAI API key not configured. Add it in Settings."),
          );
          return;
        }

        if (aborted) return;

        es = new EventSource(`${OPENAI_API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: buildRequestBody(messages, modelId),
        });

        es.addEventListener("message", (event) => {
          if (aborted) return;

          const data = event.data;
          if (!data || data === "[DONE]") {
            callbacks.onDone(fullText);
            es?.close();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              callbacks.onToken(delta);
            }

            // Check for finish_reason
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason && finishReason !== "null") {
              // Stream is done — the [DONE] message usually follows,
              // but we don't call onDone here to avoid double-firing
            }
          } catch {
            // Ignore malformed chunks — the stream may send partial data
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
            if (errorEvent.xhrState !== 4 && errorEvent.xhrState !== undefined) {
              return;
            }

            const errorMessage = messageFromResponseBody(
              errorEvent.message,
              errorEvent.xhrStatus,
              "OpenAI",
            );

            callbacks.onError(new Error(errorMessage));
          }

          es?.close();
        });

        es.addEventListener("close", () => {
          // No-op: onDone already called from message handler
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
