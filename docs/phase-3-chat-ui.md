# Phase 3 — Chat UI

> Wires the Chat and History screens into a fully functional chat interface
> with streaming, markdown rendering, conversation persistence, and model selection.

## What was built

### New files
- `src/hooks/useChat.ts` — Core orchestration hook connecting UI ↔ providers ↔ SQLite ↔ Zustand

### Updated files
- `src/components/ChatMessage.tsx` — Full markdown rendering with themed code blocks and copy button
- `src/components/ChatInput.tsx` — Send/stop toggle, disabled state styling, keyboard-friendly
- `src/components/ModelPicker.tsx` — Full modal with models grouped by configured provider
- `app/(tabs)/index.tsx` — Complete Chat screen with message list, streaming, empty states
- `app/(tabs)/history.tsx` — Conversation list with tap-to-load, long-press swipe-to-delete, pull-to-refresh
- `app/(tabs)/_layout.tsx` — Header: ModelPicker centered, New Chat button on right
- `jest.setup.js` — Added expo-clipboard mock

### New dependency
- `expo-clipboard` — For the copy code block feature

---

## Architecture decisions

### useChat hook
All chat logic is centralized in a single hook rather than scattered across components. This hook:
1. Creates conversations in SQLite on first message
2. Persists every message (user + assistant) to SQLite immediately
3. Streams tokens into Zustand's `streamingContent` for real-time display
4. On stream completion, saves the full assistant message and clears streaming state
5. On abort, saves any partial response so it's not lost
6. Handles loading conversations from history (reads SQLite → populates Zustand)

### Conversation titles
The user's full first message is stored as the conversation title in the database. The History screen truncates display with `numberOfLines={1}` and `ellipsizeMode="tail"`. No data is lost; it's a display-layer concern only.

### Markdown rendering
Assistant messages use `react-native-markdown-display` with:
- **Custom render rules** for `fence` and `code_block` nodes that wrap code in a container with:
  - Language label (top-left of code block header)
  - Copy button (top-right) using `expo-clipboard`
  - "Copied" feedback state (2 second timeout)
- **Theme-aware styles** — all markdown elements receive dark/light colors
- **Selectable text** on code blocks for manual copy fallback

User messages remain plain Text (no markdown) in an indigo bubble — matching the ChatGPT convention.

### Streaming display
During streaming, a "virtual" item is appended to the FlatList data array with `type: "streaming"`. This renders as a ChatMessage with `isStreaming={true}`, which appends a block cursor (▊) to the current `streamingContent`. When the stream completes, this virtual item disappears and the real persisted message takes its place.

### Model picker
- Only shows models from **configured** providers (those with saved API keys)
- Models grouped under provider headers
- Checkmark on the currently active model
- Empty state if no providers configured (with hint to go to Settings)

### Swipe to delete (History)
Uses `Animated.Value` for the translateX transform. Long-press reveals the delete button; a second tap on the row closes it. Delete triggers a confirmation Alert before proceeding. The delete cascades through SQLite (via `ON DELETE CASCADE` on messages), Zustand conversations store, and resets the chat if the deleted conversation was active.

### Empty states
Three distinct empty states:
1. **No provider configured** (Chat screen) — key icon, "Go to Settings" button
2. **Provider configured but no messages** (Chat screen) — chat icon, "Start a conversation" prompt
3. **No conversations** (History screen) — bubbles icon, encouraging message

### Keyboard handling
- `KeyboardAvoidingView` with `behavior="padding"` on iOS, `"height"` on Android
- `keyboardVerticalOffset` of 90 on iOS to account for tab bar + header
- `keyboardDismissMode="interactive"` on the FlatList for swipe-to-dismiss
- `keyboardShouldPersistTaps="handled"` so tapping messages doesn't dismiss keyboard

---

## Verification

- TypeScript: `npx tsc --noEmit` — 0 errors
- Unit tests: `npx jest` — 21/21 passing
- Bundle: `npx expo export --platform ios` — successful (4.6MB HBC bundle)

---

## File inventory

| File | Purpose |
|---|---|
| `src/hooks/useChat.ts` | Chat orchestration: send, stream, persist, load, delete |
| `src/components/ChatMessage.tsx` | Message bubble with markdown + copy code blocks |
| `src/components/ChatInput.tsx` | Text input with send/stop button |
| `src/components/ModelPicker.tsx` | Model selection modal grouped by provider |
| `app/(tabs)/index.tsx` | Chat screen with message list + keyboard avoiding |
| `app/(tabs)/history.tsx` | Conversation list with swipe-to-delete |
| `app/(tabs)/_layout.tsx` | Tab layout with header buttons |
| `jest.setup.js` | Test mocks (added expo-clipboard) |
