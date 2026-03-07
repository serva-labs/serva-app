import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import {
  getApiKey,
  setApiKey,
  deleteApiKey,
} from "@/src/hooks/useSecureStorage";
import { validateOpenAIKey } from "@/src/providers/openai";
import { validateAnthropicKey } from "@/src/providers/anthropic";
import { validateGoogleKey } from "@/src/providers/google";
import {
  requestDeviceCode,
  pollForToken,
  isSignedIn,
  signOut,
} from "@/src/providers/github-copilot/auth";
import { useProvidersStore } from "@/src/store/providers";
import { getProvider } from "@/src/providers/registry";

type KeyStatus = "empty" | "saved" | "validating" | "valid" | "invalid";

interface ProviderKeyCardProps {
  providerId: string;
  providerName: string;
  placeholder: string;
  onStatusChange?: (providerId: string, isConfigured: boolean) => void;
}

function ProviderKeyCard({
  providerId,
  providerName,
  placeholder,
  onStatusChange,
}: ProviderKeyCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState<KeyStatus>("empty");
  const [errorMessage, setErrorMessage] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);

  // Load existing key status on mount
  useEffect(() => {
    (async () => {
      const existing = await getApiKey(providerId);
      if (existing) {
        setHasSavedKey(true);
        setStatus("saved");
        // Show masked version
        setKeyInput("•".repeat(Math.min(existing.length, 40)));
      }
    })();
  }, [providerId]);

  const handleSave = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed || trimmed.startsWith("•")) {
      return;
    }

    setStatus("validating");
    setErrorMessage("");

    // Validate API keys for supported providers
    if (providerId === "openai") {
      const result = await validateOpenAIKey(trimmed);
      if (!result.valid) {
        setStatus("invalid");
        setErrorMessage(result.error ?? "Invalid key.");
        return;
      }
    } else if (providerId === "anthropic") {
      const result = await validateAnthropicKey(trimmed);
      if (!result.valid) {
        setStatus("invalid");
        setErrorMessage(result.error ?? "Invalid key.");
        return;
      }
    } else if (providerId === "google") {
      const result = await validateGoogleKey(trimmed);
      if (!result.valid) {
        setStatus("invalid");
        setErrorMessage(result.error ?? "Invalid key.");
        return;
      }
    }

    await setApiKey(providerId, trimmed);
    setStatus("valid");
    setHasSavedKey(true);
    setKeyInput("•".repeat(Math.min(trimmed.length, 40)));
    setShowKey(false);
    onStatusChange?.(providerId, true);

    // Reset to "saved" after showing success briefly
    setTimeout(() => setStatus("saved"), 2000);
  }, [keyInput, providerId, onStatusChange]);

  const handleRemove = useCallback(() => {
    Alert.alert(
      "Remove API Key",
      `Are you sure you want to remove the ${providerName} API key?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteApiKey(providerId);
            setKeyInput("");
            setStatus("empty");
            setHasSavedKey(false);
            setErrorMessage("");
            onStatusChange?.(providerId, false);
          },
        },
      ],
    );
  }, [providerId, providerName, onStatusChange]);

  const handleFocus = useCallback(() => {
    // If showing masked key, clear it so user can type a new one
    if (keyInput.startsWith("•")) {
      setKeyInput("");
      setShowKey(true);
    }
  }, [keyInput]);

  const statusIcon = () => {
    switch (status) {
      case "saved":
      case "valid":
        return (
          <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
        );
      case "validating":
        return <ActivityIndicator size="small" color={isDark ? "#818CF8" : "#4F46E5"} />;
      case "invalid":
        return <Ionicons name="alert-circle" size={20} color="#EF4444" />;
      default:
        return (
          <Ionicons
            name="ellipse-outline"
            size={20}
            color={isDark ? "#6B7280" : "#9CA3AF"}
          />
        );
    }
  };

  return (
    <View className="mb-4 rounded-2xl bg-gray-50 dark:bg-gray-800 p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          {statusIcon()}
          <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {providerName}
          </Text>
        </View>
        {hasSavedKey && (
          <Pressable onPress={handleRemove} hitSlop={8}>
            <Text className="text-sm text-red-500">Remove</Text>
          </Pressable>
        )}
      </View>

      {/* Input */}
      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-xl bg-white dark:bg-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600"
          placeholder={placeholder}
          placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
          value={keyInput}
          onChangeText={(text) => {
            setKeyInput(text);
            if (status === "invalid") {
              setStatus("empty");
              setErrorMessage("");
            }
          }}
          onFocus={handleFocus}
          secureTextEntry={!showKey && !keyInput.startsWith("•")}
          autoCapitalize="none"
          autoCorrect={false}
          editable={status !== "validating"}
        />
        <Pressable
          onPress={handleSave}
          disabled={
            status === "validating" || !keyInput.trim() || keyInput.startsWith("•")
          }
          className={`rounded-xl px-4 py-2.5 ${
            status === "validating" || !keyInput.trim() || keyInput.startsWith("•")
              ? "bg-gray-300 dark:bg-gray-600"
              : "bg-primary-500"
          }`}
        >
          <Text className="text-sm font-medium text-white">
            {status === "validating" ? "..." : "Save"}
          </Text>
        </Pressable>
      </View>

      {/* Error message */}
      {errorMessage ? (
        <Text className="mt-2 text-sm text-red-500">{errorMessage}</Text>
      ) : null}

      {/* Status text */}
      {status === "saved" && (
        <Text className="mt-2 text-xs text-green-600 dark:text-green-400">
          Key saved securely on device
        </Text>
      )}
      {status === "valid" && (
        <Text className="mt-2 text-xs text-green-600 dark:text-green-400">
          Key validated and saved
        </Text>
      )}
    </View>
  );
}

// ─── GitHub Copilot OAuth Card ───────────────────────────────────────────────

type CopilotStatus = "disconnected" | "requesting" | "polling" | "connected" | "error";

interface GitHubCopilotCardProps {
  onStatusChange?: (providerId: string, isConfigured: boolean) => void;
}

function GitHubCopilotCard({ onStatusChange }: GitHubCopilotCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [status, setStatus] = useState<CopilotStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [userCode, setUserCode] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Check if already signed in on mount
  useEffect(() => {
    (async () => {
      const signedIn = await isSignedIn();
      if (signedIn) {
        setStatus("connected");
      }
    })();
  }, []);

  const handleSignIn = useCallback(async () => {
    setStatus("requesting");
    setErrorMessage("");

    try {
      const deviceCode = await requestDeviceCode();
      setUserCode(deviceCode.user_code);
      setShowModal(true);
      setStatus("polling");

      // Start polling in the background
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await pollForToken(
          deviceCode.device_code,
          deviceCode.interval,
          deviceCode.expires_in,
          controller.signal,
        );

        // Success!
        setShowModal(false);
        setStatus("connected");
        setUserCode("");
        onStatusChange?.("github-copilot", true);
      } catch (pollError) {
        if (!controller.signal.aborted) {
          setShowModal(false);
          setStatus("error");
          setErrorMessage(
            pollError instanceof Error
              ? pollError.message
              : "Authorization failed. Please try again.",
          );
        }
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not start sign-in. Please try again.",
      );
    }
  }, [onStatusChange]);

  const handleCopyAndOpen = useCallback(async () => {
    await Clipboard.setStringAsync(userCode);
    await WebBrowser.openBrowserAsync("https://github.com/login/device");
  }, [userCode]);

  const handleCancelAuth = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setShowModal(false);
    setStatus("disconnected");
    setUserCode("");
    setErrorMessage("");
  }, []);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to disconnect GitHub Copilot?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            setStatus("disconnected");
            onStatusChange?.("github-copilot", false);
          },
        },
      ],
    );
  }, [onStatusChange]);

  const statusIcon = () => {
    switch (status) {
      case "connected":
        return (
          <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
        );
      case "requesting":
      case "polling":
        return (
          <ActivityIndicator
            size="small"
            color={isDark ? "#818CF8" : "#4F46E5"}
          />
        );
      case "error":
        return <Ionicons name="alert-circle" size={20} color="#EF4444" />;
      default:
        return (
          <Ionicons
            name="logo-github"
            size={20}
            color={isDark ? "#9CA3AF" : "#6B7280"}
          />
        );
    }
  };

  return (
    <>
      <View className="mb-4 rounded-2xl bg-gray-50 dark:bg-gray-800 p-4">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            {statusIcon()}
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
              GitHub Copilot
            </Text>
          </View>
          {status === "connected" && (
            <Pressable onPress={handleSignOut} hitSlop={8}>
              <Text className="text-sm text-red-500">Sign Out</Text>
            </Pressable>
          )}
        </View>

        {/* Connected state */}
        {status === "connected" && (
          <Text className="text-sm text-green-600 dark:text-green-400">
            Connected — access GPT, Claude, Gemini, and more via your Copilot
            subscription.
          </Text>
        )}

        {/* Disconnected / error state — show sign-in button */}
        {(status === "disconnected" || status === "error") && (
          <Pressable
            onPress={handleSignIn}
            className="rounded-xl bg-gray-900 dark:bg-white py-2.5 px-4 flex-row items-center justify-center gap-2"
          >
            <Ionicons
              name="logo-github"
              size={18}
              color={isDark ? "#111827" : "#FFFFFF"}
            />
            <Text className="text-sm font-medium text-white dark:text-gray-900">
              Sign in with GitHub
            </Text>
          </Pressable>
        )}

        {/* Requesting state */}
        {status === "requesting" && (
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Requesting authorization...
          </Text>
        )}

        {/* Polling state (modal is also shown) */}
        {status === "polling" && (
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for authorization...
          </Text>
        )}

        {/* Error message */}
        {errorMessage ? (
          <Text className="mt-2 text-sm text-red-500">{errorMessage}</Text>
        ) : null}

        {/* Info text for disconnected state */}
        {status === "disconnected" && (
          <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Requires a GitHub Copilot subscription. Sign in via GitHub OAuth.
          </Text>
        )}
      </View>

      {/* Device Code Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelAuth}
      >
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6">
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
              Enter Code on GitHub
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
              Copy the code below and enter it at GitHub to authorize Serva.
            </Text>

            {/* Device code display */}
            <View className="rounded-xl bg-gray-100 dark:bg-gray-700 py-4 px-6 mb-4">
              <Text className="text-2xl font-mono font-bold text-center text-gray-900 dark:text-gray-100 tracking-widest">
                {userCode}
              </Text>
            </View>

            {/* Copy & Open button */}
            <Pressable
              onPress={handleCopyAndOpen}
              className="rounded-xl bg-gray-900 dark:bg-white py-3 px-4 flex-row items-center justify-center gap-2 mb-3"
            >
              <Ionicons
                name="copy-outline"
                size={18}
                color={isDark ? "#111827" : "#FFFFFF"}
              />
              <Text className="text-sm font-medium text-white dark:text-gray-900">
                Copy Code & Open GitHub
              </Text>
            </Pressable>

            {/* Polling indicator */}
            <View className="flex-row items-center justify-center gap-2 mb-4">
              <ActivityIndicator
                size="small"
                color={isDark ? "#818CF8" : "#4F46E5"}
              />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Waiting for you to authorize...
              </Text>
            </View>

            {/* Cancel button */}
            <Pressable onPress={handleCancelAuth} className="py-2">
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Settings Screen ─────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const updateProvider = useProvidersStore((s) => s.updateProvider);
  const setActiveProviderAndModel = useProvidersStore(
    (s) => s.setActiveProviderAndModel,
  );

  const handleStatusChange = useCallback(
    (providerId: string, isConfigured: boolean) => {
      // Update Zustand store
      updateProvider(providerId, { isConfigured });

      // Also update the registry instance so sendMessage works
      const registryProvider = getProvider(providerId);
      if (registryProvider) {
        registryProvider.config.isConfigured = isConfigured;
      }

      // If a provider was just configured and there's no active model,
      // auto-select the first model from this provider
      if (isConfigured) {
        const state = useProvidersStore.getState();
        if (!state.activeProviderId || !state.activeModelId) {
          const providerConfig = state.providers.find(
            (p) => p.id === providerId,
          );
          if (providerConfig && providerConfig.models.length > 0) {
            setActiveProviderAndModel(
              providerId,
              providerConfig.models[0].id,
            );
          }
        }
      }
    },
    [updateProvider, setActiveProviderAndModel],
  );

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-900"
      contentContainerClassName="px-4 py-6"
    >
      {/* Section: API Keys */}
      <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
        API Keys
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Keys are stored securely on your device and never sent to our servers.
      </Text>

      <ProviderKeyCard
        providerId="openai"
        providerName="OpenAI"
        placeholder="sk-..."
        onStatusChange={handleStatusChange}
      />

      {/* Future providers — placeholders */}
      <ProviderKeyCard
        providerId="anthropic"
        providerName="Anthropic"
        placeholder="sk-ant-..."
        onStatusChange={handleStatusChange}
      />

      <ProviderKeyCard
        providerId="google"
        providerName="Google AI"
        placeholder="AIza..."
        onStatusChange={handleStatusChange}
      />

      {/* GitHub Copilot — OAuth device flow */}
      <GitHubCopilotCard onStatusChange={handleStatusChange} />

      {/* App info */}
      <View className="mt-8 items-center">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          Serva v0.1.0
        </Text>
      </View>
    </ScrollView>
  );
}
