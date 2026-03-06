import { Tabs } from "expo-router";
import { Pressable, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModelPicker } from "@/src/components/ModelPicker";
import { useChatStore } from "@/src/store/chat";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? "#818CF8" : "#4F46E5",
        tabBarInactiveTintColor: isDark ? "#6B7280" : "#9CA3AF",
        tabBarStyle: {
          backgroundColor: isDark ? "#111827" : "#FFFFFF",
          borderTopColor: isDark ? "#1F2937" : "#E5E7EB",
        },
        headerStyle: {
          backgroundColor: isDark ? "#111827" : "#FFFFFF",
        },
        headerTintColor: isDark ? "#F9FAFB" : "#111827",
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "",
          headerTitle: () => <ModelPicker />,
          headerRight: () => <NewChatButton />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={size}
              color={color}
            />
          ),
          tabBarLabel: "Chat",
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ─── New Chat header button ──────────────────────────────────────────────────

function NewChatButton() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const reset = useChatStore((s) => s.reset);

  return (
    <Pressable
      onPress={reset}
      hitSlop={12}
      style={{ marginRight: 12 }}
      accessibilityLabel="New chat"
      accessibilityRole="button"
    >
      <Ionicons
        name="create-outline"
        size={24}
        color={isDark ? "#9CA3AF" : "#6B7280"}
      />
    </Pressable>
  );
}
