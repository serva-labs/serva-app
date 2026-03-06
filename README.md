# Serva

A cross-platform mobile app for chatting with LLMs from multiple providers through a single unified interface. Bring your own API keys — no backend server, no data collection. All credentials and conversations are stored locally on your device.

**Supported providers:** OpenAI, Anthropic, GitHub Copilot, Google Gemini

## Features

- Chat with GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro, and 25+ more models
- Streaming responses (token-by-token rendering)
- Markdown rendering with syntax-highlighted code blocks and copy button
- Conversation history with tap to continue and swipe to delete
- Model selection per conversation — switch between any configured provider
- GitHub Copilot integration via OAuth device flow (use your Copilot subscription)
- Dark and light mode (follows system preference)
- API key validation on save for all providers
- No backend — all API calls go directly from your device to the provider

## Providers and models

| Provider | Auth | Models |
|---|---|---|
| OpenAI | API key | GPT-4o, GPT-4o mini, GPT-4.1, GPT-4.1 mini, GPT-4.1 nano, o4-mini, o3-mini |
| Anthropic | API key | Claude Opus 4, Claude Sonnet 4, Claude Sonnet 4.5, Claude Haiku 3.5 |
| GitHub Copilot | OAuth (device flow) | GPT-4o, GPT-4.1, Claude Sonnet 4, Claude 3.5/3.7 Sonnet, Gemini 2.0 Flash, Gemini 2.5 Pro, o1, o3-mini, o4-mini |
| Google Gemini | API key | Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite, 2.0 Flash, 2.0 Flash-Lite, 3.1 Pro (Preview), 3 Flash (Preview), 3.1 Flash-Lite (Preview) |

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
| Builds | EAS Build (Expo Application Services) |

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

Edit `.env` and add your API keys:

```
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_API_KEY=AIza-your-key-here
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

#### Option B: Android Emulator

1. Install [Android Studio](https://developer.android.com/studio)
2. During setup, ensure these are installed:
   - Android SDK
   - Android SDK Platform-Tools
   - Android Virtual Device (AVD)
3. Set the `ANDROID_HOME` environment variable (add to `~/.zprofile` or `~/.zshrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

4. Open Android Studio > **Device Manager** > Create a device (e.g., Pixel 8, API 35)
5. Start the emulator from Device Manager, then:

```bash
npx expo start --android
```

---

#### Option C: Physical device with Expo Go (any OS, quickest setup)

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

### 4. First launch walkthrough

1. The app opens to the **Chat** tab showing "No provider configured"
2. Tap **Go to Settings** (or the Settings tab)
3. Enter an API key for any provider and tap **Save** — the key is validated against the provider's API
4. For GitHub Copilot, tap **Sign in with GitHub** and follow the OAuth device flow
5. Go back to the **Chat** tab — the model picker in the header shows the default model
6. Type a message and tap send
7. The assistant's response streams in token-by-token with markdown rendering

## Building for Android (APK)

You can build a standalone APK and install it directly on your Android phone without going through the Play Store.

### Prerequisites

- Free [Expo account](https://expo.dev/signup)
- `eas-cli` installed globally: `npm install -g eas-cli`

### Build the APK

```bash
# Log in to your Expo account
eas login

# Build an APK (runs in the cloud, ~5-10 minutes)
eas build --platform android --profile preview
```

The first build will prompt you to confirm creating the project on Expo and generating an Android keystore — say yes to both.

When the build completes, EAS gives you a download URL for the APK.

### Install on your phone

1. Download the APK to your Android phone (via the link, email, USB, etc.)
2. On your phone, go to **Settings > Security** and enable **Install from unknown sources**
3. Open the APK file to install

### Install on an emulator

If you have Android Studio and an emulator set up, EAS can install the APK directly:

```bash
# Build and install on a running emulator
eas build --platform android --profile preview --local
adb install path/to/build.apk
```

Or let EAS handle it during the build flow — it will offer to install on a detected emulator automatically.

## Project structure

```
serva-app/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (SQLite, theme, provider init)
│   └── (tabs)/
│       ├── _layout.tsx           # Tab navigator with header buttons
│       ├── index.tsx             # Chat screen
│       ├── history.tsx           # Conversation history
│       └── settings.tsx          # API key management + GitHub OAuth
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
│   │   ├── errors.ts             # Error mapping and sanitization
│   │   ├── openai.ts             # OpenAI adapter (7 models)
│   │   ├── anthropic.ts          # Anthropic adapter (4 models)
│   │   ├── google.ts             # Google Gemini adapter (8 models)
│   │   ├── github-copilot/       # GitHub Copilot adapter (10 models)
│   │   │   ├── index.ts          # LLMProvider implementation
│   │   │   └── auth.ts           # OAuth device flow
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
├── eas.json                      # EAS Build configuration
├── jest.config.js                # Unit test config (ts-jest, node env)
├── jest.integration.config.js    # Integration test config
└── jest.setup.js                 # Test mocks for native modules
```

## Running tests

### Unit tests

```bash
npm test
```

Runs 151 tests across 6 suites covering all provider adapters — validation, configuration, streaming, error handling, abort, multi-turn conversations, and error sanitization. All native modules are mocked.

### Watch mode

```bash
npm run test:watch
```

### Integration tests

These hit real provider APIs and require valid API keys in `.env`:

```bash
npm run test:integration
```

Tests are skipped automatically for any provider whose API key is not set.

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
| `npm test` | `jest` | Run unit tests (151 tests, 6 suites) |
| `npm run test:watch` | `jest --watch` | Run tests in watch mode |
| `npm run test:integration` | `jest --config jest.integration.config.js` | Run integration tests (needs `.env`) |
| `npm run lint` | `expo lint` | Run ESLint |

## Troubleshooting

### "No simulator runtime available"

You have Xcode installed but haven't downloaded the iOS Simulator runtime yet. Open Xcode > Settings > Platforms and download the iOS runtime. See [Option A](#option-a-ios-simulator-recommended-for-macos) above.

### "adb executable doesn't seem to work"

Your Android SDK environment variables aren't set. Add to your shell config (`~/.zprofile` or `~/.zshrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then open a new terminal window and verify: `adb --version`

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
