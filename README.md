# Serva

A cross-platform mobile app for chatting with LLMs from multiple providers through a single unified interface. Bring your own API keys — no backend server, no data collection. All credentials and conversations are stored locally on your device.

**Supported providers:** OpenAI (live), GitHub Copilot (planned), Anthropic (planned), Google (planned)

## Features

- Multi-provider text chat through a single interface
- Streaming responses (token-by-token rendering)
- Markdown rendering with syntax-highlighted code blocks and copy button
- Conversation history with search and delete
- Model selection per conversation (GPT-4o, GPT-4.1, o4-mini, etc.)
- Dark and light mode (follows system preference)
- API key validation on save
- No backend — all API calls go directly from your device to the provider

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo 55 (managed workflow) |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| Styling | Nativewind v4 (Tailwind CSS for React Native) |
| State | Zustand |
| Database | expo-sqlite (local, on-device) |
| Secure storage | expo-secure-store (Keychain / Keystore) |
| Streaming | react-native-sse |
| Markdown | react-native-markdown-display |

## Prerequisites

- **Node.js** >= 20.x (>= 20.19.4 recommended to suppress warnings)
- **npm** >= 10.x
- **Git**

For running on a simulator/emulator, you need **one** of the following:

| Platform | Requirement |
|---|---|
| iOS Simulator (macOS only) | Xcode + iOS Simulator runtime |
| Android Emulator | Android Studio + Android SDK + AVD |
| Physical device | [Expo Go](https://expo.dev/go) app installed on your phone |

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/serva-labs/serva-app.git
cd serva-app
npm install
```

### 2. Set up environment variables (optional, for integration tests)

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

This is only needed for integration tests. The app itself stores API keys through its Settings screen using encrypted device storage.

### 3. Run the app

Pick **one** of the methods below depending on your setup.

---

#### Option A: iOS Simulator (recommended for macOS)

You need Xcode and an iOS Simulator runtime installed.

**First-time setup — download the simulator runtime:**

Open Xcode, go to **Settings > Platforms** (or **Xcode > Settings > Components** in older versions), and download the **iOS Simulator** runtime. This is a one-time ~5 GB download.

Alternatively, from the terminal:

```bash
# List what's available
xcodebuild -showsdks

# Download the iOS simulator runtime via Xcode's UI:
# Xcode > Settings > Platforms > + > iOS
```

Once the runtime is installed, create a simulator device if one doesn't exist:

```bash
# Check if you have any simulator devices
xcrun simctl list devices available

# If the list is empty, create one (example: iPhone 16 Pro)
xcrun simctl create "iPhone 16 Pro" "iPhone 16 Pro" iOS26.2
```

Then start the app:

```bash
npx expo start --ios
```

This will boot the simulator and load the app automatically. On subsequent runs, the simulator stays warm and startup is faster.

---

#### Option B: Physical device with Expo Go (any OS, quickest setup)

This requires no simulator or emulator at all. Your phone and laptop must be on the same Wi-Fi network.

1. Install **Expo Go** on your phone:
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Start the dev server:

```bash
npx expo start
```

3. Scan the QR code shown in the terminal:
   - **iOS**: Scan with the Camera app — it will open Expo Go
   - **Android**: Scan from inside the Expo Go app

The app will load on your phone with hot reload. Code changes appear in ~1-2 seconds.

> **Note**: Some native modules (like expo-secure-store) work in Expo Go but with limitations. For full native functionality, use a simulator or a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

---

#### Option C: Android Emulator

1. Install [Android Studio](https://developer.android.com/studio)
2. During setup, ensure these are installed:
   - Android SDK
   - Android SDK Platform-Tools
   - Android Virtual Device (AVD)
3. Open Android Studio > **Virtual Device Manager** > Create a device (e.g., Pixel 8, API 34)
4. Start the emulator from AVD Manager, then:

```bash
npx expo start --android
```

---

### 4. First launch walkthrough

1. The app opens to the **Chat** tab showing "No API key configured"
2. Tap **Go to Settings** (or the Settings tab)
3. Enter your OpenAI API key and tap **Save** — the key is validated against OpenAI's API
4. Go back to the **Chat** tab — the model picker in the header shows "GPT-4o"
5. Type a message and tap send
6. The assistant's response streams in token-by-token with markdown rendering

## Project structure

```
serva-app/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (SQLite, theme, provider init)
│   └── (tabs)/
│       ├── _layout.tsx           # Tab navigator with header buttons
│       ├── index.tsx             # Chat screen
│       ├── history.tsx           # Conversation history
│       └── settings.tsx          # API key management
├── src/
│   ├── components/
│   │   ├── ChatMessage.tsx       # Message bubble with markdown rendering
│   │   ├── ChatInput.tsx         # Text input with send/stop button
│   │   └── ModelPicker.tsx       # Model selection modal
│   ├── hooks/
│   │   ├── useChat.ts            # Chat orchestration (send, stream, persist)
│   │   └── useSecureStorage.ts   # Encrypted key/token storage wrapper
│   ├── providers/
│   │   ├── types.ts              # LLMProvider interface and core types
│   │   ├── registry.ts           # Provider registry (singleton map)
│   │   ├── openai.ts             # OpenAI adapter (streaming, validation)
│   │   └── init.ts               # Provider initialization on app startup
│   ├── store/
│   │   ├── chat.ts               # Zustand: messages, streaming state
│   │   ├── providers.ts          # Zustand: active provider/model
│   │   └── conversations.ts      # Zustand: conversation list
│   ├── db/
│   │   └── schema.ts             # SQLite migrations
│   └── constants/
│       └── Colors.ts             # Theme color values
├── docs/                         # Architecture and phase documentation
├── assets/                       # Fonts, icons, splash images
├── jest.config.js                # Unit test config (ts-jest, node env)
├── jest.integration.config.js    # Integration test config
└── jest.setup.js                 # Test mocks for native modules
```

## Running tests

### Unit tests

```bash
npm test
```

Runs 21 tests covering the OpenAI provider adapter — validation, configuration, streaming, error handling, abort, and multi-turn conversations. All native modules are mocked.

### Watch mode

```bash
npm run test:watch
```

### Integration tests

These hit the real OpenAI API and require a valid API key in `.env`:

```bash
npm run test:integration
```

If `OPENAI_API_KEY` is not set, integration tests are skipped automatically.

### Type checking

```bash
npx tsc --noEmit
```

## Available scripts

| Script | Command | Description |
|---|---|---|
| `npm start` | `expo start` | Start Expo dev server (shows QR code) |
| `npm run ios` | `expo start --ios` | Start and open in iOS Simulator |
| `npm run android` | `expo start --android` | Start and open in Android Emulator |
| `npm test` | `jest` | Run unit tests |
| `npm run test:watch` | `jest --watch` | Run tests in watch mode |
| `npm run test:integration` | `jest --config jest.integration.config.js` | Run integration tests (needs `.env`) |
| `npm run lint` | `expo lint` | Run ESLint |

## Troubleshooting

### "No simulator runtime available"

You have Xcode installed but haven't downloaded the iOS Simulator runtime yet. Open Xcode > Settings > Platforms and download the iOS runtime. See [Option A](#option-a-ios-simulator-recommended-for-macos) above.

### Node.js version warnings

If you see `Node.js (v20.x.x) is outdated and unsupported`, React Native 0.83 recommends Node >= 20.19.4. You can either upgrade Node or ignore the warnings — everything works on 20.12+.

```bash
# If using nvm:
nvm install 20
nvm use 20
```

### Metro bundler cache issues

If you see stale code or weird errors after pulling changes:

```bash
npx expo start --clear
```

### "Cannot connect to Metro" on physical device

Make sure your phone and laptop are on the same Wi-Fi network. Corporate/guest networks sometimes block local traffic. Try using a personal hotspot as a fallback.

## Architecture

See [docs/architecture.md](docs/architecture.md) for full architectural decisions, provider interface design, database schema, authentication flows, and security model.

## License

MIT
