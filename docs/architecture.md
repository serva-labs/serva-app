# Serva - Architecture & Decisions

> Multi-provider AI chat app for iOS and Android.
> Your AI, your keys, your device.

## 1. Product Overview

| Field | Value |
|---|---|
| **Name** | Serva |
| **Organisation** | serva-labs |
| **Repository** | [serva-labs/serva-app](https://github.com/serva-labs/serva-app) |
| **Distribution** | Apple App Store + Google Play Store |
| **Monetisation** | Free core app, freemium model in the future |
| **License** | MIT |

Serva is a mobile application that allows users to interact with large language models (LLMs) from multiple providers — all from a single unified interface. Users bring their own API keys or authenticate via OAuth. All credentials are stored locally on the device. There is no backend server.

### Core Principles

- **User owns their data** — No server, no telemetry, no data collection.
- **Provider agnostic** — One interface, many AI providers.
- **Open architecture** — Adding a new provider means implementing a single TypeScript interface.
- **Native quality** — Should feel like a native app, not a webview wrapper.

---

## 2. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | React Native + Expo (managed workflow + dev builds) | Cross-platform iOS/Android from a single TypeScript codebase. Expo handles native complexity and store submissions via EAS. |
| **Language** | TypeScript | Type safety, better DX, essential for the provider interface contracts. |
| **Navigation** | Expo Router (file-based) | Modern file-based routing, familiar to web developers. |
| **Styling** | Nativewind v4 (Tailwind CSS for React Native) | Leverages existing Tailwind CSS knowledge from web development. Utility-first approach with dark/light mode support. |
| **State Management** | Zustand | Lightweight, minimal boilerplate, works well with React Native. |
| **Secure Storage** | expo-secure-store | Hardware-backed encrypted storage (iOS Keychain / Android Keystore) for API keys and OAuth tokens. |
| **Local Database** | expo-sqlite | SQLite for conversation history, settings, and preferences. All data stays on device. |
| **Streaming** | react-native-sse | Server-Sent Events support for real-time token streaming from LLM APIs. |
| **Markdown** | react-native-markdown-display | Render LLM responses with Markdown formatting and code blocks. |
| **Theming** | Dark + Light, follows system preference | Via Nativewind's built-in dark mode support. |

---

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│                Mobile App                    │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Chat UI  │  │ History  │  │ Settings  │  │
│  │  Screen   │  │  Screen  │  │  Screen   │  │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│        │              │              │        │
│  ┌─────▼──────────────▼──────────────▼─────┐  │
│  │         Provider Abstraction Layer       │  │
│  │   (common interface for all providers)   │  │
│  └─────┬──────────┬──────────┬─────────────┘  │
│        │          │          │                │
│  ┌─────▼───┐ ┌───▼────┐ ┌──▼──────────┐     │
│  │ GitHub  │ │ OpenAI │ │  Anthropic   │ ... │
│  │ Adapter │ │Adapter │ │  Adapter     │     │
│  └─────┬───┘ └───┬────┘ └──┬──────────┘     │
│        │          │          │                │
│  ┌─────▼──────────▼──────────▼─────┐         │
│  │     Secure Storage (keys/tokens) │         │
│  │     expo-secure-store             │         │
│  └──────────────────────────────────┘         │
│                                              │
│  ┌──────────────────────────────────┐         │
│  │  Local DB (conversations/history) │         │
│  │  SQLite via expo-sqlite           │         │
│  └──────────────────────────────────┘         │
└──────────────────────────────────────┴────────┘
         │          │          │
         ▼          ▼          ▼
   GitHub API   OpenAI API   Anthropic API
```

### Key Design Decisions

- **Direct from device** — The app calls provider APIs directly. No proxy server, no middleware. This eliminates server costs, latency, and trust concerns.
- **Provider abstraction layer** — All providers implement the same TypeScript interface (`LLMProvider`). Adding a new provider is a single file implementing this interface.
- **Per-message model tracking** — The database schema stores `provider_id` and `model_id` on every message. In v1, model selection is per-conversation. This future-proofs for mid-conversation model switching without schema changes.

---

## 4. Provider Interface

The core abstraction that makes the app provider-agnostic:

```typescript
interface LLMProvider {
  id: string;                          // e.g. 'openai', 'github-copilot'
  name: string;                        // Display name
  icon: string;                        // Icon asset reference
  authType: 'oauth' | 'api-key';

  // Authentication
  authenticate(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  revokeAuth(): Promise<void>;

  // Models
  listModels(): Promise<Model[]>;

  // Chat
  sendMessage(params: {
    model: string;
    messages: Message[];
    onToken: (token: string) => void;  // Streaming callback
    signal?: AbortSignal;              // Cancellation
  }): Promise<Message>;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  capabilities: ('chat' | 'code' | 'vision')[];
  contextWindow?: number;
  maxOutputTokens?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  provider?: string;
}
```

---

## 5. Authentication Flows

### GitHub Copilot (OAuth Device Flow)

GitHub Copilot uses an undocumented but widely-used API (same as OpenCode, Cline, Continue):

```
1. POST https://github.com/login/device/code
   client_id=Iv1.b507a08c87ecfe98 (VS Code Copilot client ID)
   scope=read:user

2. User opens browser, enters code at github.com/login/device

3. App polls POST https://github.com/login/oauth/access_token
   → Receives: gho_xxxxxxxxxxxx (GitHub OAuth token)

4. GET https://api.github.com/copilot_internal/v2/token
   Authorization: Token gho_xxxxxxxxxxxx
   → Receives: short-lived Copilot JWT (~30 min expiry)

5. POST https://api.githubcopilot.com/chat/completions
   Authorization: Bearer <copilot-jwt>
   Headers: Editor-Version, Copilot-Integration-Id: vscode-chat
   Body: OpenAI-compatible chat completions format

6. Token refresh: On 401, re-do step 4 with stored gho_ token
   Retry: On 429/500, exponential backoff (max 8 retries)
```

The GitHub OAuth token (`gho_*`) is stored in `expo-secure-store`. The short-lived Copilot JWT is kept in memory and refreshed on 401.

**Available models via Copilot:** GPT-4o, GPT-4.1, Claude 3.5/3.7/Sonnet 4, Gemini 2.0 Flash, Gemini 2.5 Pro, o1, o3-mini, o4-mini — all included in the Copilot subscription at no additional cost.

### OpenAI / Anthropic / Google (API Key)

1. User generates an API key from the provider's dashboard
2. User pastes the key into the app's settings screen
3. Key is stored in `expo-secure-store` (encrypted, hardware-backed)
4. App calls the provider's API directly with the stored key

| Provider | API Endpoint | Auth Header |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer sk-...` |
| Anthropic | `https://api.anthropic.com/v1/messages` | `x-api-key: sk-ant-...` |
| Google | `https://generativelanguage.googleapis.com/v1beta/...` | `x-goog-api-key: ...` |

---

## 6. Database Schema

SQLite database using `expo-sqlite`. All data stored locally on device.

### Tables

```sql
-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Messages (per-message provider/model tracking for future flexibility)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  provider_id TEXT,
  model_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Provider configurations (which providers are enabled, display preferences)
CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Schema versioning
PRAGMA user_version = 1;
```

### Migration Strategy

Using the `PRAGMA user_version` approach (as recommended by Expo docs):
- Check `user_version` on app start
- Run incremental migrations as needed
- Each migration bumps `user_version`

---

## 7. Security Model

| Concern | Approach |
|---|---|
| **API key storage** | `expo-secure-store` — AES-256 encrypted, hardware-backed (iOS Keychain / Android Keystore). Only the app can read its own entries. |
| **OAuth tokens** | Same as API keys — stored in `expo-secure-store`. |
| **Short-lived tokens** | Copilot JWTs (~30 min) kept in memory only, not persisted. |
| **Network traffic** | All API calls over HTTPS. No plain HTTP. |
| **Data at rest** | Conversations stored in SQLite on device. Not encrypted by default (standard for most apps). SQLCipher available as future option. |
| **No server** | No backend = no data exfiltration vector, no breach risk from server-side. |
| **Jailbroken devices** | On compromised devices, Keychain/Keystore can be accessed. Not mitigated in v1 (standard industry practice). |
| **Biometrics** | Not in v1. Future option: require Face ID / fingerprint to open app. |

---

## 8. Build Phases

| Phase | Focus | Key Deliverables |
|---|---|---|
| **0** | Repository & Documentation | GitHub repo, architectural docs, .gitignore |
| **1** | Project Scaffolding | Expo project, Nativewind, Expo Router tabs, SQLite schema, provider interface, Zustand stores, secure storage wrapper |
| **2** | First Provider — OpenAI | API key entry screen, OpenAI adapter, streaming chat completions |
| **3** | Chat UI | Message list, streaming text, markdown/code rendering, input bar, conversation management |
| **4** | GitHub Copilot Provider | OAuth device flow, token exchange, Copilot adapter |
| **5** | Additional Providers + Polish | Anthropic & Google adapters, error handling, app icon, splash, EAS builds, store submission |

---

## 9. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **GitHub Copilot API is undocumented** | Medium | Many tools rely on it (OpenCode, Cline, Continue). If it breaks, we still have OpenAI/Anthropic/Google. Monitor for changes. |
| **Apple App Store rejection** | Medium | Ensure the app adds genuine value beyond a simple API wrapper (multi-provider, conversation management, markdown rendering). Make API key entry UX polished with clear instructions. |
| **SSE streaming in React Native** | Low | `react-native-sse` library handles this. If issues arise, fall back to polling or use Expo development builds with native module support. |
| **Using VS Code's OAuth client ID** | Low | Standard practice in the ecosystem. GitHub could block it but hasn't for years. We can register our own GitHub OAuth App as a fallback. |
| **Rate limiting across providers** | Low | v1 shows simple error messages with retry. Can add auto-retry with backoff in a future release. |

---

## 10. Future Considerations

These are explicitly **not in v1** but the architecture supports them:

- **Image input** — Vision-capable models (GPT-4o, Claude 3.5+, Gemini) support image input. Would require camera/gallery picker integration.
- **Biometric lock** — Optional Face ID / fingerprint to open the app.
- **Conversation export** — JSON export, share as text, iCloud/Google Drive backup.
- **Mid-conversation model switching** — DB schema already supports per-message model tracking. UI change only.
- **System prompts** — Custom system prompts per conversation or as templates.
- **Temperature/parameter controls** — Advanced users may want to tune generation parameters.
- **Freemium features** — Themes, sync, advanced export, priority support.
- **Plugin system** — Allow community-contributed provider adapters.
