# Phase 2: OpenAI Provider

> First provider implementation — OpenAI Chat Completions API with streaming.

## What was built

### OpenAI Adapter (`src/providers/openai.ts`)

Implements the `LLMProvider` interface for OpenAI's `/v1/chat/completions` endpoint.

**Key design decisions:**

- **Hardcoded flagship model set** (7 models): GPT-4o, GPT-4o mini, GPT-4.1, GPT-4.1 mini, GPT-4.1 nano, o4-mini, o3-mini. Dynamic model fetching can be added later.
- **Default system prompt**: `"You are a helpful assistant."` is prepended to every conversation. Will be configurable in a future release.
- **Streaming via `react-native-sse`**: Uses the `EventSource` class to establish an SSE connection. Tokens are emitted via `onToken` callback, and the full text is passed to `onDone` when the stream completes.
- **Abort support**: `sendMessage()` returns a `StreamController` with an `abort()` method that closes the SSE connection.
- **Error mapping**: HTTP status codes (401, 429, 500, 503) are mapped to user-friendly error messages.

### API Key Validation (`validateOpenAIKey`)

Before saving an API key, the Settings screen validates it by calling OpenAI's `/v1/models` endpoint. Returns structured `{ valid, error }` results.

### Settings Screen (`app/(tabs)/settings.tsx`)

- **API key entry cards** for OpenAI, Anthropic, and Google (Anthropic/Google save without validation for now — validation will be added when their adapters are implemented)
- **Validate on save** — hits the OpenAI models endpoint before persisting
- **Secure storage** — keys stored via `expo-secure-store`
- **Visual feedback** — loading spinner during validation, green checkmark on success, red error on failure
- **Remove key** — confirmation alert before deletion
- **GitHub Copilot** — placeholder card noting OAuth sign-in is coming

### Provider Initialization (`src/providers/init.ts`)

- Called once from root layout during app startup
- Creates provider instances, checks SecureStore for existing credentials
- Registers providers and syncs state to Zustand
- Sets default active model to `gpt-4o` if OpenAI is configured

## Testing

### Unit Tests (21 tests)

```bash
npm test
```

All tests mock native modules (expo-secure-store, react-native-sse) and global fetch.

| Test group | Count | What's tested |
|---|---|---|
| `validateOpenAIKey` | 6 | 200/401/429/500/502 responses, network errors, non-JSON bodies |
| `OpenAIProvider.config` | 3 | Provider ID, model list (7 flagship), initial state |
| `validateCredentials` | 3 | No key, valid key, invalid key |
| `listModels` | 1 | Returns hardcoded list |
| `sendMessage` | 8 | EventSource URL/headers/body, token streaming, [DONE] handling, no-key error, 401/429 SSE errors, abort, malformed JSON resilience, multi-turn conversation |

### Integration Tests (skippable)

```bash
INTEGRATION=1 OPENAI_API_KEY=sk-... npm run test:integration
```

Hits the real OpenAI API to validate a real key and confirm rejection of invalid keys. Skipped automatically when env vars aren't set.

## Files created/modified

| File | Action | Purpose |
|---|---|---|
| `src/providers/openai.ts` | Created | OpenAI adapter + key validation |
| `src/providers/init.ts` | Created | Provider initialization on app startup |
| `src/providers/__tests__/openai.test.ts` | Created | 21 unit tests |
| `src/providers/__tests__/integration/openai.integration.test.ts` | Created | 2 integration tests (skippable) |
| `app/(tabs)/settings.tsx` | Replaced | Full settings screen with API key management |
| `app/_layout.tsx` | Modified | Added provider initialization + splash screen gate |
| `jest.config.js` | Created | Jest config (ts-jest, node env) |
| `jest.integration.config.js` | Created | Separate config for integration tests |
| `jest.setup.js` | Created | Mock expo-secure-store and react-native-sse |
| `package.json` | Modified | Added test scripts + dev deps |
