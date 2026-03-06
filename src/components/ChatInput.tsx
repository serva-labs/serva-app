/**
 * ChatInput — text input bar with send/stop button.
 *
 * Features:
 * - Auto-expanding multiline TextInput (up to 120px)
 * - Send button (disabled when empty, indigo primary)
 * - Stop button (red, shown during streaming)
 * - Keyboard-aware: editable toggles off during streaming
 */

import { View, TextInput, Pressable, useColorScheme } from "react-native";
import { useState, useRef, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";

interface ChatInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function ChatInput({ onSend, isStreaming, onStop }: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
    // Keep focus on input after sending
    inputRef.current?.focus();
  }, [text, isStreaming, onSend]);

  const canSend = text.trim().length > 0 && !isStreaming;

  return (
    <View className="flex-row items-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      <TextInput
        ref={inputRef}
        className="flex-1 min-h-[40px] max-h-[120px] rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-base text-gray-900 dark:text-gray-100"
        placeholder="Message..."
        placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
        value={text}
        onChangeText={setText}
        multiline
        returnKeyType="default"
        blurOnSubmit={false}
        editable={!isStreaming}
      />
      {isStreaming ? (
        <Pressable
          onPress={onStop}
          className="h-10 w-10 items-center justify-center rounded-full bg-red-500"
          accessibilityLabel="Stop generating"
          accessibilityRole="button"
        >
          <Ionicons name="stop" size={18} color="white" />
        </Pressable>
      ) : (
        <Pressable
          onPress={handleSend}
          className={`h-10 w-10 items-center justify-center rounded-full ${
            canSend ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"
          }`}
          disabled={!canSend}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={canSend ? "white" : isDark ? "#6B7280" : "#9CA3AF"}
          />
        </Pressable>
      )}
    </View>
  );
}
