import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getApiKey,
  setApiKey,
  deleteApiKey,
} from "@/src/hooks/useSecureStorage";
import { validateOpenAIKey } from "@/src/providers/openai";
import { useProvidersStore } from "@/src/store/providers";

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

    // Only validate OpenAI keys for now
    if (providerId === "openai") {
      const result = await validateOpenAIKey(trimmed);
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

// ─── Settings Screen ─────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const updateProvider = useProvidersStore((s) => s.updateProvider);

  const handleStatusChange = useCallback(
    (providerId: string, isConfigured: boolean) => {
      updateProvider(providerId, { isConfigured });
    },
    [updateProvider],
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

      {/* GitHub Copilot will use OAuth, not key entry — placeholder for now */}
      <View className="mb-4 rounded-2xl bg-gray-50 dark:bg-gray-800 p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="ellipse-outline" size={20} color={isDark ? "#6B7280" : "#9CA3AF"} />
          <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
            GitHub Copilot
          </Text>
        </View>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          OAuth sign-in coming in a future update.
        </Text>
      </View>

      {/* App info */}
      <View className="mt-8 items-center">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          Serva v0.1.0
        </Text>
      </View>
    </ScrollView>
  );
}
