import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SQLiteProvider } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { migrateDb } from "@/src/db/schema";
import { initializeProviders } from "@/src/providers/init";

import "../global.css";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [providersReady, setProvidersReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    initializeProviders()
      .then(() => setProvidersReady(true))
      .catch((err) => {
        // Log and continue in degraded mode — don't freeze on splash forever
        console.error("Failed to initialize providers:", err);
        setProvidersReady(true);
      });
  }, []);

  useEffect(() => {
    if (fontsLoaded && providersReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, providersReady]);

  if (!fontsLoaded || !providersReady) {
    return null;
  }

  return (
    <SQLiteProvider databaseName="serva.db" onInit={migrateDb}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
