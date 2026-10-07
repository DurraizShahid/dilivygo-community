import "react-native-gesture-handler";
import { initSentryExpo, wrapRootForSentry } from "@dilivygo/observability/expo";
import { useCallback, useEffect, useRef } from "react";

initSentryExpo({
  surface: "vendor-mobile",
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  release: process.env.EXPO_PUBLIC_RELEASE_SHA,
});
import { Text, TextInput } from "react-native";
import { Stack, useSegments, useRouter } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { useAuthStore } from "@/stores/auth-store";
import { useCurrencyStore } from "@/lib/currency";
import { AppThemeProvider, useAppTheme } from "@/providers/theme-provider";
import { MobileI18nRoot } from "@/i18n/mobile-i18n-root";
import { VendorOrderRealtimeHost } from "@/providers/vendor-order-realtime-provider";
import {
  registerForPushNotifications,
  setupNotificationHandlers,
  addNotificationListeners,
  handleInitialNotification,
} from "@/lib/notifications";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

function applyDefaultFont() {
  const style = { fontFamily: "Inter_400Regular" };
  const textProps = (Text as any).defaultProps || {};
  (Text as any).defaultProps = { ...textProps, style: [style, textProps.style] };
  const inputProps = (TextInput as any).defaultProps || {};
  (TextInput as any).defaultProps = { ...inputProps, style: [style, inputProps.style] };
}

function ThemedStatusBar() {
  const { isDark } = useAppTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function ThemedRootStack() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const { hydrate, isAuthenticated, isLoading } = useAuthStore();
  const hydrateCurrency = useCurrencyStore((s) => s.hydrate);
  const segments = useSegments();
  const router = useRouter();
  const notificationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hydrate();
    void hydrateCurrency();
  }, [hydrate, hydrateCurrency]);

  useEffect(() => {
    setupNotificationHandlers();
    notificationCleanupRef.current = addNotificationListeners();
    void handleInitialNotification();
    return () => {
      notificationCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      void registerForPushNotifications();
    }
  }, [isAuthenticated, isLoading]);

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded) {
      applyDefaultFont();
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  useEffect(() => {
    onLayoutReady();
  }, [onLayoutReady]);

  useEffect(() => {
    if (isLoading || !fontsLoaded) return;
    const inAuth = segments[0] === "login";
    if (!isAuthenticated && !inAuth) {
      router.replace("/login");
    } else if (isAuthenticated && inAuth) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <MobileI18nRoot>
          <VendorOrderRealtimeHost>
            <ThemedStatusBar />
            <ThemedRootStack />
          </VendorOrderRealtimeHost>
        </MobileI18nRoot>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}

export default wrapRootForSentry(RootLayout);
