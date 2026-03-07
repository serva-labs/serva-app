/**
 * GitHub Copilot provider adapter.
 *
 * Implements the LLMProvider interface for the Copilot Chat API.
 * Uses the OpenAI-compatible chat/completions endpoint at
 * api.githubcopilot.com with Copilot JWT authentication.
 *
 * Key differences from direct OpenAI:
 * - Auth via short-lived Copilot JWT (not API key)
 * - Requires Editor-Version and Copilot-Integration-Id headers
 * - Auto-refreshes JWT on 401
 * - Models include GPT, Claude, Gemini, and o-series
 *
 * Available models (all included in Copilot subscription):
 * - GPT-4o, GPT-4.1
 * - Claude Sonnet 4, Claude 3.5 Sonnet
 * - Gemini 2.0 Flash, Gemini 2.5 Pro
 * - o1, o3-mini, o4-mini
 */

import EventSource from "react-native-sse";
import {
  getCopilotToken,
  refreshCopilotToken,
} from "./auth";
import {
  messageFromResponseBody,
  messageForNetworkError,
} from "../errors";
import type {
  LLMProvider,
  ProviderConfig,
  Model,
  Message,
  StreamCallbacks,
  StreamController,
} from "../types";

// ─── Constants ───────────────────────────────────────────────────────────────

const COPILOT_API_BASE = "https://api.githubcopilot.com";
const PROVIDER_ID = "github-copilot";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

const COPILOT_MODELS: Model[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
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
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 8192,
  },
  {
    id: "claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 64000,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    providerId: PROVIDER_ID,
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "o1",
    name: "o1",
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
  {
    id: "o4-mini",
    name: "o4-mini",
    providerId: PROVIDER_ID,
    contextWindow: 200000,
    maxTokens: 100000,
  },
];

// ─── Headers ─────────────────────────────────────────────────────────────────

function buildHeaders(copilotJwt: string): Record<string, string> {
  return {
    Authorization: `Bearer ${copilotJwt}`,
    "Content-Type": "application/json",
    "Editor-Version": "vscode/1.100.0",
    "Editor-Plugin-Version": "copilot-chat/0.25.0",
    "Copilot-Integration-Id": "vscode-chat",
    "User-Agent": "Serva/1.0.0",
  };
}

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

// ─── GitHub Copilot Provider class ───────────────────────────────────────────

export class GitHubCopilotProvider implements LLMProvider {
  config: ProviderConfig;

  constructor(isConfigured = false) {
    this.config = {
      id: PROVIDER_ID,
      name: "GitHub Copilot",
      authType: "oauth",
      isConfigured,
      models: COPILOT_MODELS,
    };
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const token = await getCopilotToken();
      const isValid = token !== null;
      this.config.isConfigured = isValid;
      return isValid;
    } catch {
      this.config.isConfigured = false;
      return false;
    }
  }

  async listModels(): Promise<Model[]> {
    return COPILOT_MODELS;
  }

  sendMessage(
    messages: Pick<Message, "role" | "content">[],
    modelId: string,
    callbacks: StreamCallbacks,
  ): StreamController {
    let fullText = "";
    let aborted = false;
    let es: InstanceType<typeof EventSource> | null = null;

    (async () => {
      try {
        // Get a valid Copilot JWT
        let token = await getCopilotToken();
        if (!token) {
          callbacks.onError(
            new Error(
              "GitHub Copilot is not connected. Sign in from Settings.",
            ),
          );
          return;
        }

        if (aborted) return;

        const startStream = (jwt: string) => {
          es = new EventSource(`${COPILOT_API_BASE}/chat/completions`, {
            method: "POST",
            headers: buildHeaders(jwt),
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

              // Only process once the full response is available
              if (
                errorEvent.xhrState !== 4 &&
                errorEvent.xhrState !== undefined
              ) {
                return;
              }

              // On 401, try refreshing the JWT once
              if (errorEvent.xhrStatus === 401 && !retried) {
                retried = true;
                es?.close();
                handleRetry();
                return;
              }

              const errorMessage = messageFromResponseBody(
                errorEvent.message,
                errorEvent.xhrStatus,
                "GitHub Copilot",
              );

              callbacks.onError(new Error(errorMessage));
            }

            es?.close();
          });

          es.addEventListener("close", () => {
            // No-op: onDone already called from message handler
          });

          es.open();
        };

        let retried = false;

        const handleRetry = async () => {
          try {
            const newToken = await refreshCopilotToken();
            if (!newToken) {
              callbacks.onError(
                new Error(
                  "GitHub authorization has expired. Please sign in again from Settings.",
                ),
              );
              return;
            }
            if (aborted) return;

            // Reset for the retry
            fullText = "";
            startStream(newToken);
          } catch {
            callbacks.onError(
              new Error(
                "GitHub authorization has expired. Please sign in again from Settings.",
              ),
            );
          }
        };

        startStream(token);
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
