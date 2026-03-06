import { View, Text } from "react-native";

export default function SettingsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
      <Text className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Settings
      </Text>
      <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Configure your API keys and preferences
      </Text>
    </View>
  );
}
