# Phase 5: Google Gemini Provider

## Overview

Added Google Gemini as the fourth and final LLM provider. Users can now chat with all major LLM providers (OpenAI, Anthropic, GitHub Copilot, Google) through a single unified interface.

## What was built

### `src/providers/google.ts` — GoogleProvider adapter

Full `LLMProvider` implementation for Google's Generative Language REST API:

- **8 models**: Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite, 2.0 Flash, 2.0 Flash-Lite (GA) + Gemini 3.1 Pro, 3 Flash, 3.1 Flash-Lite (Preview)
- **SSE streaming** via `react-native-sse` — same pattern as other providers
- **API key validation** (`validateGoogleKey`) — hits `GET /v1beta/models?key=` to verify key before saving
- **Format translation** handled internally by the adapter (caller never sees differences):
  - `role: "assistant"` → `role: "model"`
  - `messages` array → `contents` array with `parts: [{ text }]`
  - System prompt → top-level `system_instruction` field
  - SSE response → extracts `candidates[0].content.parts[0].text`
- **Stream completion via `close` event** — Google has no `[DONE]` sentinel like OpenAI or `message_stop` like Anthropic. Guards prevent `onDone` from firing after errors or aborts.

### `src/providers/errors.ts` — Google error mapping

- Added `GOOGLE_ERROR_STATUSES` map for validation-specific errors (INVALID_ARGUMENT, PERMISSION_DENIED, RESOURCE_EXHAUSTED, UNAUTHENTICATED, UNAVAILABLE, INTERNAL, NOT_FOUND)
- Added `messageForGoogleError()` function — used by `validateGoogleKey` in Settings
- Streaming errors continue to use `messageFromResponseBody()` which shows raw API messages prefixed with "Google:"

### `src/providers/init.ts` — Google registration

- Google provider is now created, checked for credentials, and registered at app startup
- Default model selection falls through: OpenAI → Anthropic → Copilot → Google (gemini-2.5-flash)

### `app/(tabs)/settings.tsx` — Google key validation

- The existing Google AI card now validates keys on save (previously saved without validation)
- Uses `validateGoogleKey` with the same UX pattern as OpenAI and Anthropic

### `.env.example` — Updated

- Added `GOOGLE_API_KEY="AIza..."` entry

## Key technical decisions

### Gemini API format differences

Google's Generative Language API has significant format differences from OpenAI/Anthropic:

| Feature | OpenAI | Anthropic | Google |
|---|---|---|---|
| Auth | `Authorization: Bearer` header | `x-api-key` header | `?key=` query param |
| Endpoint | Single `/chat/completions` | Single `/messages` | Per-model `/models/{id}:streamGenerateContent` |
| Messages field | `messages` | `messages` | `contents` |
| Assistant role | `"assistant"` | `"assistant"` | `"model"` |
| System prompt | Message with `role: "system"` | Top-level `system` string | Top-level `system_instruction.parts` |
| Stream end | `[DONE]` sentinel | `message_stop` event | Connection close |
| Text location | `choices[0].delta.content` | `delta.text` (in `content_block_delta`) | `candidates[0].content.parts[0].text` |

All differences are handled inside `GoogleProvider` — the `useChat` hook and UI components see the same `LLMProvider` interface as every other provider.

### Stream completion via close event

Since Google has no explicit end-of-stream marker, we rely on the SSE `close` event. This requires extra guards:

- `errored` flag prevents `onDone` from firing after an error
- `doneFired` flag prevents double-firing if `close` is emitted multiple times
- `aborted` flag prevents callbacks after user cancellation

### API key in query param

Google's API accepts the key in a query parameter (`?key=AIza...`) rather than an auth header. This is Google's recommended approach for the Generative Language API. We also send `Content-Type: application/json` but no auth header.

## Files changed

| File | Change |
|---|---|
| `src/providers/google.ts` | **New** — GoogleProvider class, validateGoogleKey, 8 models |
| `src/providers/errors.ts` | Added GOOGLE_ERROR_STATUSES, messageForGoogleError() |
| `src/providers/init.ts` | Register Google provider, check credentials, set default |
| `app/(tabs)/settings.tsx` | Import validateGoogleKey, add validation branch for google |
| `.env.example` | Added GOOGLE_API_KEY |
| `src/providers/__tests__/google.test.ts` | **New** — 27 unit tests |
| `src/providers/__tests__/integration/google.integration.test.ts` | **New** — 2 integration tests |

## Test results

- **151 tests across 6 suites, all passing**
- 27 new Google unit tests: validation (8), config (3), credentials (3), streaming (13)
- 2 new Google integration tests (skippable without GOOGLE_API_KEY)
- All existing tests (124) continue to pass unchanged
