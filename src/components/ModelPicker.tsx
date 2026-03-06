/**
 * ModelPicker — modal for selecting provider + model.
 *
 * Features:
 * - Pill button in the header that opens a modal
 * - Models grouped by provider
 * - Only shows configured providers (ones with valid API keys)
 * - Checkmark on the currently active model
 * - Tapping a model selects it and closes the modal
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  useColorScheme,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProvidersStore } from "@/src/store/providers";
import type { ProviderConfig, Model } from "@/src/providers/types";

// ─── Section data type for grouped list ──────────────────────────────────────

type ListItem =
  | { type: "header"; provider: ProviderConfig }
  | { type: "model"; model: Model; providerId: string; isActive: boolean };

export function ModelPicker() {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // Use primitive selectors to avoid re-render loops from derived arrays/objects
  const providers = useProvidersStore((s) => s.providers);
  const activeProviderId = useProvidersStore((s) => s.activeProviderId);
  const activeModelId = useProvidersStore((s) => s.activeModelId);
  const setActiveProviderAndModel = useProvidersStore(
    (s) => s.setActiveProviderAndModel,
  );

  // Derive values with useMemo to keep stable references
  const configuredProviders = useMemo(
    () => providers.filter((p) => p.isConfigured),
    [providers],
  );

  const activeModel = useMemo(() => {
    const provider = providers.find((p) => p.id === activeProviderId);
    return provider?.models.find((m) => m.id === activeModelId);
  }, [providers, activeProviderId, activeModelId]);

  const displayText = activeModel ? activeModel.name : "Select model";

  const handleSelect = useCallback(
    (providerId: string, modelId: string) => {
      setActiveProviderAndModel(providerId, modelId);
      setVisible(false);
    },
    [setActiveProviderAndModel],
  );

  // Build flat list data with section headers
  const listData = useMemo(() => {
    const items: ListItem[] = [];
    for (const provider of configuredProviders) {
      items.push({ type: "header", provider });
      for (const model of provider.models) {
        items.push({
          type: "model",
          model,
          providerId: provider.id,
          isActive: model.id === activeModelId,
        });
      }
    }
    return items;
  }, [configuredProviders, activeModelId]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return (
        <View
          className="px-5 pt-4 pb-2"
          style={{
            backgroundColor: isDark ? "#111827" : "#FFFFFF",
          }}
        >
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {item.provider.name}
          </Text>
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => handleSelect(item.providerId, item.model.id)}
        className="flex-row items-center justify-between px-5 py-3.5"
        style={({ pressed }) => [
          {
            backgroundColor: pressed
              ? isDark
                ? "#1F2937"
                : "#F3F4F6"
              : isDark
                ? "#111827"
                : "#FFFFFF",
          },
        ]}
      >
        <View className="flex-1">
          <Text className="text-base font-medium text-gray-900 dark:text-gray-100">
            {item.model.name}
          </Text>
          {item.model.contextWindow && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {Math.round(item.model.contextWindow / 1000)}k context
            </Text>
          )}
        </View>
        {item.isActive && (
          <Ionicons
            name="checkmark-circle"
            size={22}
            color={isDark ? "#818CF8" : "#4F46E5"}
          />
        )}
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        className="flex-row items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5"
        accessibilityLabel="Select model"
        accessibilityRole="button"
      >
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={isDark ? "#9CA3AF" : "#6B7280"}
        />
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView
          style={{ flex: 1 }}
          className="bg-white dark:bg-gray-900"
        >
          {/* Modal header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Select Model
            </Text>
            <Pressable
              onPress={() => setVisible(false)}
              hitSlop={12}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Ionicons
                name="close"
                size={24}
                color={isDark ? "#9CA3AF" : "#6B7280"}
              />
            </Pressable>
          </View>

          {configuredProviders.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons
                name="key-outline"
                size={48}
                color={isDark ? "#374151" : "#D1D5DB"}
              />
              <Text className="mt-4 text-base text-center text-gray-500 dark:text-gray-400">
                No providers configured yet. Add an API key in Settings to get
                started.
              </Text>
            </View>
          ) : (
            <FlatList
              data={listData}
              renderItem={renderItem}
              keyExtractor={(item, index) =>
                item.type === "header"
                  ? `header-${item.provider.id}`
                  : `model-${item.model.id}`
              }
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}
