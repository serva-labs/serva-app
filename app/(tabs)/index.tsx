/**
 * Chat Screen — the main conversation interface.
 *
 * Layout:
 * - Header: ModelPicker pill (center), New Chat button (right)
 * - Body: FlatList of messages, auto-scrolling on new content
 * - Footer: ChatInput bar with keyboard avoiding
 *
 * States:
 * - Empty (no provider): prompt to add API key in Settings
 * - Empty (provider configured): "Start a conversation" prompt
 * - Active chat: message list + streaming indicator
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ChatMessage } from "@/src/components/ChatMessage";
import { ChatInput } from "@/src/components/ChatInput";
import { ModelPicker } from "@/src/components/ModelPicker";
import { useChat } from "@/src/hooks/useChat";
import {
  useProvidersStore,
  selectConfiguredProviders,
} from "@/src/store/providers";
import type { Message } from "@/src/providers/types";

// ─── Message list item type (includes streaming placeholder) ─────────────────

type DisplayItem =
  | { type: "message"; message: Message }
  | { type: "streaming"; content: string };

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    stopStreaming,
    newChat,
  } = useChat();

  const configuredProviders = useProvidersStore(selectConfiguredProviders);
  const hasProvider = configuredProviders.length > 0;

  // Build display list: messages + streaming placeholder
  const displayData: DisplayItem[] = messages.map((m) => ({
    type: "message" as const,
    message: m,
  }));

  if (isStreaming && streamingContent) {
    displayData.push({
      type: "streaming" as const,
      content: streamingContent,
    });
  }

  // Auto-scroll to bottom on new messages/streaming
  const scrollToBottom = useCallback(() => {
    if (displayData.length > 0) {
      // Use a short delay to let the FlatList render
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [displayData.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isStreaming, streamingContent.length > 0]);

  // Handle send
  const handleSend = useCallback(
    async (text: string) => {
      const result = await sendMessage(text);
      if (result?.error) {
        // Error is handled by adding an error message in useChat
        // but we could show an alert here if needed
      }
    },
    [sendMessage],
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayItem }) => {
      if (item.type === "streaming") {
        return (
          <ChatMessage
            role="assistant"
            content={item.content}
            isStreaming
          />
        );
      }
      return (
        <ChatMessage
          role={item.message.role}
          content={item.message.content}
        />
      );
    },
    [],
  );

  const keyExtractor = useCallback(
    (item: DisplayItem, index: number) => {
      if (item.type === "streaming") return "streaming-placeholder";
      return item.message.id;
    },
    [],
  );

  // ─── Empty states ────────────────────────────────────────────────────────

  if (!hasProvider) {
    return (
      <View className="flex-1 bg-white dark:bg-gray-900 items-center justify-center px-8">
        <Ionicons
          name="key-outline"
          size={56}
          color={isDark ? "#374151" : "#D1D5DB"}
        />
        <Text className="mt-5 text-lg font-semibold text-gray-900 dark:text-gray-100 text-center">
          No API key configured
        </Text>
        <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
          Add an API key in Settings to start chatting with AI models.
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/settings")}
          className="mt-6 rounded-full bg-primary-500 px-6 py-3"
          accessibilityLabel="Go to Settings"
          accessibilityRole="button"
        >
          <Text className="text-base font-semibold text-white">
            Go to Settings
          </Text>
        </Pressable>
      </View>
    );
  }

  const emptyChat = messages.length === 0 && !isStreaming;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View className="flex-1 bg-white dark:bg-gray-900">
        {emptyChat ? (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={56}
              color={isDark ? "#374151" : "#D1D5DB"}
            />
            <Text className="mt-5 text-lg font-semibold text-gray-900 dark:text-gray-100 text-center">
              Start a conversation
            </Text>
            <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
              Type a message below to chat with the selected model.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={displayData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={stopStreaming}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
