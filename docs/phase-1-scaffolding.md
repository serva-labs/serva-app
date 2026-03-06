# Phase 1: Project Scaffolding

> Status: Pending
> Depends on: Phase 0 (Repository Setup)

## Objective

Set up the foundational project structure: Expo project with TypeScript, Nativewind styling, Expo Router navigation, SQLite database, secure storage, Zustand state management, and the provider abstraction layer.

After this phase, the app will:
- Run on iOS and Android simulators
- Display 3 tabs (Chat, History, Settings) with placeholder content
- Have the provider interface defined (no providers implemented yet)
- Have the SQLite schema created with migration support
- Have Zustand stores wired up for chat, providers, and conversations
- Have a secure storage wrapper ready for API key management

---

## Prerequisites

- Node.js >= 18
- npm or yarn
- Expo CLI (`npx expo`)
- iOS Simulator (Xcode) and/or Android Emulator (Android Studio) — optional for this phase

---

## Step-by-Step Implementation

### 1. Create Expo Project

```bash
npx create-expo-app@latest serva-app --template tabs
```

This scaffolds a TypeScript Expo project with Expo Router and a tabs layout. We will replace the default tab content with our own screens.

> **Note:** Since we already have the git repo, we'll create the Expo project in a temporary directory and move the files into our repo.

### 2. Install Nativewind

```bash
npm install nativewind react-native-reanimated react-native-safe-area-context
npm install --dev tailwindcss@^3.4.17 prettier-plugin-tailwindcss@^0.5.11
```

### 3. Install Core Dependencies

```bash
npx expo install expo-secure-store expo-sqlite
npm install zustand react-native-sse react-native-markdown-display
```

### 4. Configure Nativewind

#### 4a. Create `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

#### 4b. Create `global.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 4c. Modify `metro.config.js`

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

#### 4d. Modify `babel.config.js`

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

#### 4e. Create `nativewind-env.d.ts`

```ts
/// <reference types="nativewind/types" />
```

#### 4f. Update `app.json`

Add web bundler configuration:
```json
{
  "expo": {
    "web": {
      "bundler": "metro"
    }
  }
}
```

### 5. Set Up Expo Router Tabs

#### Files to create/modify:

| File | Purpose |
|---|---|
| `app/_layout.tsx` | Root layout — wraps app with SQLiteProvider |
| `app/(tabs)/_layout.tsx` | Tab navigator with 3 tabs: Chat, History, Settings |
| `app/(tabs)/index.tsx` | Chat screen (main screen, default tab) |
| `app/(tabs)/history.tsx` | Conversation history list |
| `app/(tabs)/settings.tsx` | Provider configuration and app settings |

### 6. Create Provider Abstraction Layer

| File | Purpose |
|---|---|
| `src/providers/types.ts` | TypeScript interfaces: `LLMProvider`, `Model`, `Message`, `Conversation` |
| `src/providers/registry.ts` | Provider registry: register, list, get providers by ID |

### 7. Create SQLite Schema

| File | Purpose |
|---|---|
| `src/db/schema.ts` | Database migration function with `conversations`, `messages`, and `provider_configs` tables |

Uses the `PRAGMA user_version` migration pattern from Expo docs.

### 8. Create Secure Storage Wrapper

| File | Purpose |
|---|---|
| `src/hooks/useSecureStorage.ts` | Hook wrapping `expo-secure-store` for API key get/set/delete operations |

### 9. Create Zustand Stores

| File | Purpose |
|---|---|
| `src/store/chat.ts` | Current conversation state: messages array, streaming flag, active model |
| `src/store/providers.ts` | Provider configuration state: list of configured providers, active provider |
| `src/store/conversations.ts` | Conversation list state: all conversations, CRUD operations |

### 10. Create Placeholder UI Components

| File | Purpose |
|---|---|
| `src/components/ChatMessage.tsx` | Single message bubble — renders user/assistant messages differently |
| `src/components/ChatInput.tsx` | Text input bar with send button |
| `src/components/ModelPicker.tsx` | Provider/model selection dropdown |

---

## Dependencies (with versions)

### Production

| Package | Version | Purpose |
|---|---|---|
| `expo` | ~55.x | Core Expo SDK |
| `expo-router` | ~55.x | File-based navigation |
| `expo-secure-store` | ~55.x | Encrypted key/token storage |
| `expo-sqlite` | ~55.x | Local SQLite database |
| `nativewind` | ^4.x | Tailwind CSS for React Native |
| `react-native-reanimated` | (Expo managed) | Required by Nativewind |
| `react-native-safe-area-context` | (Expo managed) | Required by Nativewind |
| `zustand` | ^5.x | State management |
| `react-native-sse` | ^1.x | SSE streaming support |
| `react-native-markdown-display` | ^7.x | Markdown rendering |

### Development

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | ^3.4.17 | Tailwind CSS compiler (required by Nativewind v4) |
| `prettier-plugin-tailwindcss` | ^0.5.11 | Auto-sort Tailwind classes |
| `typescript` | (Expo managed) | TypeScript compiler |

---

## Acceptance Criteria

Phase 1 is complete when:

- [ ] `npx expo start` launches without errors
- [ ] The app displays 3 tabs: Chat, History, Settings
- [ ] Nativewind classes render correctly (e.g. `className="bg-white dark:bg-black"`)
- [ ] SQLite database creates tables on first launch
- [ ] Provider interface is defined in `src/providers/types.ts`
- [ ] Provider registry can register and retrieve providers
- [ ] Zustand stores initialise without errors
- [ ] Secure storage wrapper can get/set/delete values
- [ ] All TypeScript compiles without errors

---

## File Tree After Phase 1

```
serva-app/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── history.tsx
│   │   └── settings.tsx
│   └── _layout.tsx
├── src/
│   ├── providers/
│   │   ├── types.ts
│   │   └── registry.ts
│   ├── db/
│   │   └── schema.ts
│   ├── store/
│   │   ├── chat.ts
│   │   ├── providers.ts
│   │   └── conversations.ts
│   ├── hooks/
│   │   └── useSecureStorage.ts
│   └── components/
│       ├── ChatMessage.tsx
│       ├── ChatInput.tsx
│       └── ModelPicker.tsx
├── docs/
│   ├── architecture.md
│   └── phase-1-scaffolding.md
├── global.css
├── tailwind.config.js
├── metro.config.js
├── babel.config.js
├── nativewind-env.d.ts
├── app.json
├── package.json
├── tsconfig.json
├── .gitignore
└── LICENSE
```
