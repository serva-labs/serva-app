/**
 * ChatInput — text input bar with send button.
 *
 * Placeholder for Phase 1. Will be enhanced in Phase 3 with:
 * - Auto-expanding TextInput
 * - Send/Stop button toggle based on streaming state
 * - Keyboard avoiding behavior
 */

import { View, TextInput, Pressable, Text } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming?: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, isStreaming, onStop }: ChatInputProps) {
  const [text, setText] = useState("");
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View className="flex-row items-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      <TextInput
        className="flex-1 min-h-[40px] max-h-[120px] rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-gray-100"
        placeholder="Message..."
        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
        value={text}
        onChangeText={setText}
        multiline
        onSubmitEditing={handleSend}
        editable={!isStreaming}
      />
      {isStreaming ? (
        <Pressable
          onPress={onStop}
          className="h-10 w-10 items-center justify-center rounded-full bg-red-500"
        >
          <Ionicons name="stop" size={18} color="white" />
        </Pressable>
      ) : (
        <Pressable
          onPress={handleSend}
          className="h-10 w-10 items-center justify-center rounded-full bg-primary-500"
          disabled={!text.trim()}
        >
          <Ionicons name="arrow-up" size={20} color="white" />
        </Pressable>
      )}
    </View>
  );
}
