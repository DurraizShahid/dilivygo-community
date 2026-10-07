import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import type { User } from "@dilivygo/types";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import * as SecureStore from "expo-secure-store";
import { api, VENDOR_STAFF_TOKEN_KEY, setApiAuthToken } from "@/lib/api";
import { tenantHostErrorFallbackMessage } from "@dilivygo/api";
import { useAuthStore } from "@/stores/auth-store";

function createLoginStyles(c: AppColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: c.muted,
      justifyContent: "center" as const,
      paddingHorizontal: spacing.xl,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl,
      padding: spacing.xl,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    title: {
      fontSize: fontSize["3xl"],
      fontWeight: "700" as const,
      color: c.foreground,
      textAlign: "center" as const,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center" as const,
      marginBottom: spacing.xl,
    },
    input: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md + 2,
      alignItems: "center" as const,
      marginTop: spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: c.primaryForeground,
      fontSize: fontSize.base,
      fontWeight: "600" as const,
    },
  };
}

export default function LoginScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createLoginStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.login(email.trim(), password);
      if (res && "user" in res && res.user) {
        if ("token" in res && typeof res.token === "string" && res.token) {
          await SecureStore.setItemAsync(VENDOR_STAFF_TOKEN_KEY, res.token);
          setApiAuthToken(res.token);
        }
        setUser(res.user);
        router.replace("/(tabs)");
      } else {
        Alert.alert("Error", "Invalid credentials.");
      }
    } catch (err: unknown) {
      const tenantMsg = tenantHostErrorFallbackMessage(err);
      Alert.alert(
        "Error",
        tenantMsg || "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Dilivygo Vendor</Text>
        <Text style={styles.subtitle}>Sign in to manage your restaurant</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
