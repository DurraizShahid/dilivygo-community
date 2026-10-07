import "react-native-gesture-handler";
import { initSentryExpo, wrapRootForSentry } from "@dilivygo/observability/expo";
import { useEffect, useCallback, useRef } from "react";

initSentryExpo({
  surface: "customer-mobile",
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  release: process.env.EXPO_PUBLIC_RELEASE_SHA,
});
import { Text, TextInput } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { StripeProvider } from "@stripe/stripe-react-native";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { useCurrencyStore } from "@/lib/currency";
import { AppThemeProvider, useAppTheme } from "@/providers/theme-provider";
import { MobileI18nRoot } from "@/i18n/mobile-i18n-root";
import {
  registerForPushNotifications,
  setupNotificationHandlers,
  addNotificationListeners,
  handleInitialNotification,
} from "@/lib/notifications";
import { defaultWorkspaceRef } from "@/lib/workspace-ref";
import { CartRemoteSyncProvider } from "@/providers/cart-remote-sync-provider";

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

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

  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const segments = useSegments();

  const hydrateCurrency = useCurrencyStore((s) => s.hydrate);
  const notificationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    hydrate();
    void hydrateCurrency(defaultWorkspaceRef());

    let cancelled = false;
    void Promise.resolve(useLocationStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      const { status, detectLocation } = useLocationStore.getState();
      if (status === "idle") detectLocation();
    });

    // Set up notification handlers
    setupNotificationHandlers();

    // Add notification listeners
    notificationCleanupRef.current = addNotificationListeners();

    // Handle notification that launched the app
    handleInitialNotification();

    return () => {
      cancelled = true;
      notificationCleanupRef.current?.();
    };
  }, []);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      registerForPushNotifications().then((result) => {
        if (result.token) {
          console.log("Push notifications registered");
        }
      });
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

    const inAuthScreen = segments[0] === "login";

    if (!isAuthenticated && !inAuthScreen) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.com.dilivygo.customer"
    >
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <MobileI18nRoot>
            <CartRemoteSyncProvider>
              <ThemedStatusBar />
              <ThemedRootStack />
            </CartRemoteSyncProvider>
          </MobileI18nRoot>
        </AppThemeProvider>
      </QueryClientProvider>
    </StripeProvider>
  );
}

export default wrapRootForSentry(RootLayout);
