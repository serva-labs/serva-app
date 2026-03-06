import { View, Text } from "react-native";

export default function ChatScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
      <Text className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Chat
      </Text>
      <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Select a model and start chatting
      </Text>
    </View>
  );
}
