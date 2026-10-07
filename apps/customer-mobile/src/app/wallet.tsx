import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePaymentSheet } from "@stripe/stripe-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { formatPrice, useCurrencyStore } from "@/lib/currency";
import { useAppTheme } from "@/providers/theme-provider";
import { spacing, fontSize, fonts, borderRadius } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow } from "@/lib/screen-layout";
import type { CustomerWalletLedgerType } from "@dilivygo/types";

const TX_LABEL: Record<CustomerWalletLedgerType, string> = {
  topup_stripe: "Top-up",
  admin_credit: "Credit",
  admin_debit: "Debit",
  refund_credit: "Refund",
  checkout_debit: "Order payment",
  adjustment: "Adjustment",
};

export default function WalletScreen() {
  const { t } = useTranslation("mobile");
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const currency = useCurrencyStore((s) => s.code);
  const walletEnabled = useCurrencyStore((s) => s.customerWalletEnabled);
  const queryClient = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [amountStr, setAmountStr] = useState("");
  const [loading, setLoading] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-wallet"],
    queryFn: () => api.customerWallet.get(),
    enabled: walletEnabled,
  });

  async function handleTopup() {
    const n = parseFloat(amountStr.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert("", t("screens.wallet.invalidAmount"));
      return;
    }
    const amountCents = Math.round(n * 100);
    if (amountCents < 50) {
      Alert.alert("", t("screens.wallet.minTopup", { amount: formatPrice(50, currency) }));
      return;
    }
    setLoading(true);
    try {
      const res = await api.customerWallet.topupIntent({
        amountCents,
        currency: currency.toLowerCase(),
      });
      if (res.isDummy) {
        Alert.alert("", t("screens.wallet.topupSuccess"));
        setAmountStr("");
        void queryClient.invalidateQueries({ queryKey: ["customer-wallet"] });
        return;
      }
      if (!res.clientSecret) {
        Alert.alert("", t("screens.wallet.topupFail"));
        return;
      }
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: res.clientSecret,
        merchantDisplayName: "Dilivygo",
        allowsDelayedPaymentMethods: false,
      });
      if (initError) {
        Alert.alert("Payment", initError.message);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError?.code === "Canceled") return;
      if (presentError) {
        Alert.alert("Payment", presentError.message);
        return;
      }
      Alert.alert("", t("screens.wallet.topupSuccess"));
      setAmountStr("");
      void queryClient.invalidateQueries({ queryKey: ["customer-wallet"] });
    } catch (e: unknown) {
      Alert.alert("", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const balance = data?.balanceCents ?? 0;
  const txs = data?.transactions ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: t("screens.wallet.title"),
          headerShown: true,
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground, fontFamily: fonts.semibold },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingHorizontal: SCREEN_H_PAD,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {!walletEnabled ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, lineHeight: 22 }}>
            {t("screens.wallet.disabled")}
          </Text>
        ) : (
          <>
            <Text
              style={{
                fontSize: fontSize.sm,
                color: colors.mutedForeground,
                fontFamily: fonts.regular,
                marginBottom: spacing.lg,
              }}
            >
              {t("screens.wallet.subtitle")}
            </Text>

            {error ? (
              <Text style={{ color: colors.destructive, marginBottom: spacing.md }}>
                {t("screens.wallet.loadError")}
              </Text>
            ) : null}

            <View
              style={[
                {
                  borderRadius: borderRadius.xl,
                  backgroundColor: colors.card,
                  padding: spacing.lg,
                  marginBottom: spacing.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: `${colors.foreground}12`,
                },
                elevatedCardShadow(),
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: fonts.bold,
                  color: colors.mutedForeground,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                {t("screens.wallet.balance")}
              </Text>
              {isLoading ? (
                <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
              ) : (
                <Text
                  style={{
                    marginTop: spacing.sm,
                    fontSize: 36,
                    fontFamily: fonts.extrabold,
                    color: colors.foreground,
                    letterSpacing: -0.5,
                  }}
                >
                  {formatPrice(balance, currency)}
                </Text>
              )}
            </View>

            <View
              style={[
                {
                  borderRadius: borderRadius.xl,
                  backgroundColor: colors.card,
                  padding: spacing.lg,
                  marginBottom: spacing.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: `${colors.foreground}12`,
                },
                elevatedCardShadow(),
              ]}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.foreground }}>
                {t("screens.wallet.topUp")}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground, marginTop: 4, marginBottom: spacing.md }}>
                {t("screens.wallet.minTopup", { amount: formatPrice(50, currency) })}
              </Text>
              <TextInput
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder={t("screens.wallet.amountPlaceholder")}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.mutedForeground}
                style={{
                  backgroundColor: colors.muted,
                  borderRadius: borderRadius.lg,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  fontSize: fontSize.base,
                  fontFamily: fonts.medium,
                  color: colors.foreground,
                  marginBottom: spacing.md,
                }}
              />
              <TouchableOpacity
                onPress={() => void handleTopup()}
                disabled={loading}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: borderRadius.lg,
                  paddingVertical: spacing.md,
                  alignItems: "center",
                  opacity: loading ? 0.65 : 1,
                }}
                activeOpacity={0.88}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={{ fontFamily: fonts.bold, color: colors.primaryForeground, fontSize: fontSize.sm }}>
                    {t("screens.wallet.continue")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View
              style={[
                {
                  borderRadius: borderRadius.xl,
                  backgroundColor: colors.card,
                  overflow: "hidden",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: `${colors.foreground}12`,
                },
                elevatedCardShadow(),
              ]}
            >
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: `${colors.foreground}10` }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: fontSize.base, color: colors.foreground }}>
                  {t("screens.wallet.activity")}
                </Text>
              </View>
              {txs.length === 0 ? (
                <Text style={{ padding: spacing.lg, color: colors.mutedForeground, fontFamily: fonts.regular }}>
                  {t("screens.wallet.emptyActivity")}
                </Text>
              ) : (
                txs.map((tx) => (
                  <View
                    key={tx.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: `${colors.foreground}08`,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.md }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.foreground }} numberOfLines={2}>
                        {TX_LABEL[tx.type] ?? tx.type}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2 }} numberOfLines={1}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: fonts.bold,
                        fontSize: fontSize.sm,
                        color: tx.amountCents >= 0 ? colors.success : colors.destructive,
                      }}
                    >
                      {tx.amountCents >= 0 ? "+" : ""}
                      {formatPrice(tx.amountCents, currency)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}
