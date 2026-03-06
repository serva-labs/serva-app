/**
 * History Screen — list past conversations.
 *
 * Features:
 * - Lists all conversations ordered by updatedAt descending
 * - Shows title (truncated with ellipsis), model name, and relative time
 * - Tap to load conversation and switch to Chat tab
 * - Swipe left to reveal delete button
 * - Pull to refresh
 * - Empty state when no conversations exist
 */

import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  useColorScheme,
  Alert,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useChat } from "@/src/hooks/useChat";
import { useConversationsStore, type Conversation } from "@/src/store/conversations";
import { useProvidersStore } from "@/src/store/providers";

// ─── Relative time formatting ────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ─── Get model display name from provider store ──────────────────────────────

function useModelName(providerId: string, modelId: string): string {
  const providers = useProvidersStore((s) => s.providers);
  const provider = providers.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  return model?.name ?? modelId;
}

// ─── Swipeable conversation row ──────────────────────────────────────────────

function ConversationRow({
  conversation,
  onPress,
  onDelete,
}: {
  conversation: Conversation;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const modelName = useModelName(conversation.providerId, conversation.modelId);
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwiped = useRef(false);

  const DELETE_BUTTON_WIDTH = 80;

  const handleSwipeLeft = useCallback(() => {
    if (!isSwiped.current) {
      Animated.spring(translateX, {
        toValue: -DELETE_BUTTON_WIDTH,
        useNativeDriver: true,
        friction: 8,
      }).start();
      isSwiped.current = true;
    }
  }, [translateX]);

  const handleSwipeBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
    }).start();
    isSwiped.current = false;
  }, [translateX]);

  const handlePress = useCallback(() => {
    if (isSwiped.current) {
      handleSwipeBack();
    } else {
      onPress();
    }
  }, [onPress, handleSwipeBack]);

  const handleLongPress = useCallback(() => {
    handleSwipeLeft();
  }, [handleSwipeLeft]);

  const handleDelete = useCallback(() => {
    handleSwipeBack();
    Alert.alert(
      "Delete conversation",
      "This will permanently delete this conversation and all its messages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: onDelete,
        },
      ],
    );
  }, [onDelete, handleSwipeBack]);

  return (
    <View style={{ overflow: "hidden" }}>
      {/* Delete button behind the row */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: DELETE_BUTTON_WIDTH,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#EF4444",
        }}
      >
        <Pressable
          onPress={handleDelete}
          style={{
            flex: 1,
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
          accessibilityLabel="Delete conversation"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={22} color="white" />
        </Pressable>
      </View>

      {/* Swipeable row */}
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
          style={({ pressed }) => [
            {
              backgroundColor: pressed
                ? isDark
                  ? "#1F2937"
                  : "#F9FAFB"
                : isDark
                  ? "#111827"
                  : "#FFFFFF",
            },
          ]}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text
                className="text-base font-medium text-gray-900 dark:text-gray-100"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {conversation.title}
              </Text>
              <Text className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {modelName}
              </Text>
            </View>
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {formatRelativeTime(conversation.updatedAt)}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Main History Screen ─────────────────────────────────────────────────────

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const { loadConversation, loadConversations, deleteConversation } = useChat();
  const conversations = useConversationsStore((s) => s.conversations);
  const isLoading = useConversationsStore((s) => s.isLoading);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handlePress = useCallback(
    async (conversationId: string) => {
      await loadConversation(conversationId);
      router.push("/(tabs)/");
    },
    [loadConversation, router],
  );

  const handleDelete = useCallback(
    (conversationId: string) => {
      deleteConversation(conversationId);
    },
    [deleteConversation],
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationRow
        conversation={item}
        onPress={() => handlePress(item.id)}
        onDelete={() => handleDelete(item.id)}
      />
    ),
    [handlePress, handleDelete],
  );

  if (conversations.length === 0 && !isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900 px-8">
        <Ionicons
          name="chatbubbles-outline"
          size={56}
          color={isDark ? "#374151" : "#D1D5DB"}
        />
        <Text className="mt-5 text-lg font-semibold text-gray-900 dark:text-gray-100 text-center">
          No conversations yet
        </Text>
        <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
          Start a chat and your conversations will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-gray-900">
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onRefresh={loadConversations}
        refreshing={isLoading}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
