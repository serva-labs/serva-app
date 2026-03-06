import { View, Text } from "react-native";
import { Link, Stack } from "expo-router";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900 p-5">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
          This screen doesn't exist.
        </Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-primary-500">Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}
