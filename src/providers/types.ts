/**
 * Provider abstraction layer — core TypeScript interfaces.
 *
 * Every LLM provider (OpenAI, GitHub Copilot, Anthropic, Google) implements
 * the `LLMProvider` interface. This gives us a single API surface for the
 * chat UI regardless of which backend is in use.
 */

// ─── Message types ───────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  providerId: string;
  modelId: string;
  createdAt: number; // Unix ms
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export interface StreamController {
  abort: () => void;
}

// ─── Model / Provider metadata ───────────────────────────────────────────────

export interface Model {
  id: string; // e.g. "gpt-4o", "claude-sonnet-4-20250514"
  name: string; // Display name, e.g. "GPT-4o"
  providerId: string;
  maxTokens?: number;
  contextWindow?: number;
}

export type ProviderAuthType = "api-key" | "oauth";

export interface ProviderConfig {
  id: string; // e.g. "openai", "github-copilot", "anthropic", "google"
  name: string; // Display name, e.g. "OpenAI"
  authType: ProviderAuthType;
  isConfigured: boolean;
  models: Model[];
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface LLMProvider {
  readonly config: ProviderConfig;

  /**
   * Validate stored credentials. Returns true if the provider is ready to use.
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Send a chat completion request with streaming.
   * Returns a controller to abort the stream.
   */
  sendMessage(
    messages: Pick<Message, "role" | "content">[],
    modelId: string,
    callbacks: StreamCallbacks,
  ): StreamController;

  /**
   * List models available from this provider.
   * Some providers (e.g. GitHub Copilot) have a fixed model list;
   * others (OpenAI) can fetch dynamically.
   */
  listModels(): Promise<Model[]>;
}
