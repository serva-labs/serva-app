/**
 * ChatMessage — renders a single message bubble.
 *
 * Placeholder for Phase 1. Will be enhanced in Phase 3 with:
 * - Markdown rendering via react-native-markdown-display
 * - Code block syntax highlighting
 * - Copy code button
 * - Streaming text animation
 */

import { View, Text } from "react-native";
import type { MessageRole } from "@/src/providers/types";

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <View
      className={`px-4 py-3 ${
        isUser ? "items-end" : "items-start"
      }`}
    >
      <View
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary-500 rounded-br-md"
            : "bg-gray-100 dark:bg-gray-800 rounded-bl-md"
        }`}
      >
        <Text
          className={`text-base leading-6 ${
            isUser
              ? "text-white"
              : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {content}
          {isStreaming && "▊"}
        </Text>
      </View>
    </View>
  );
}
