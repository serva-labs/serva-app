/**
 * ModelPicker — dropdown/modal for selecting provider + model.
 *
 * Placeholder for Phase 1. Will be enhanced later with:
 * - Grouped by provider
 * - Model capability indicators
 * - Last-used model memory
 */

import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "react-native";
import {
  useProvidersStore,
  selectActiveProvider,
  selectActiveModel,
} from "@/src/store/providers";

interface ModelPickerProps {
  onPress?: () => void;
}

export function ModelPicker({ onPress }: ModelPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const activeProvider = useProvidersStore(selectActiveProvider);
  const activeModel = useProvidersStore(selectActiveModel);

  const displayText = activeModel
    ? `${activeProvider?.name} / ${activeModel.name}`
    : "Select a model";

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5"
    >
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {displayText}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={isDark ? "#9CA3AF" : "#6B7280"}
      />
    </Pressable>
  );
}
