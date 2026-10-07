import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { formatPrice, useCurrencyStore } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow } from "@/lib/screen-layout";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { Order } from "@dilivygo/types";
import { canSubmitOrderRating, getApiErrorMessage } from "@dilivygo/api";

function createRateStyles(c: AppColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    heading: {
      fontSize: fontSize["2xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      marginBottom: spacing.xl,
      letterSpacing: -0.4,
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.mutedForeground,
      marginBottom: spacing.sm,
      marginTop: spacing.lg,
    },
    starRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    starButton: {
      padding: spacing.xs,
    },
    commentInput: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
      minHeight: 80,
      textAlignVertical: "top",
    },
    tipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    tipButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: c.muted,
    },
    tipButtonActive: {
      backgroundColor: c.primary,
    },
    tipText: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.foreground,
    },
    tipTextActive: {
      color: c.primaryForeground,
    },
    customTipInput: {
      backgroundColor: c.muted,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: fontSize.base,
      color: c.foreground,
      marginTop: spacing.md,
    },
    submitButton: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.xl,
      height: 54,
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.xl,
      ...elevatedCardShadow(2),
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    submitText: {
      color: c.primaryForeground,
      fontSize: fontSize.base,
      fontFamily: fonts.bold,
    },
    helperText: {
      marginTop: spacing.xs,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
  });
}

const rateHeaderOptions = (colors: AppColors) => ({
  headerShown: true as const,
  title: "Rate Order",
  headerBackTitle: "Back",
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.foreground },
  headerShadowVisible: false as const,
});

export default function RateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currencySymbol = (() => {
    try {
      const code = useCurrencyStore.getState().code;
      return new Intl.NumberFormat("en", { style: "currency", currency: code })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code;
    } catch {
      return useCurrencyStore.getState().code || "";
    }
  })();
  const [vendorRating, setVendorRating] = useState(0);
  const [riderRating, setRiderRating] = useState(0);
  const [comment, setComment] = useState("");
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingShopReview, setHasExistingShopReview] = useState(false);

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["order", id],
    queryFn: () => api.orders.get(id!),
    enabled: !!id,
  });

  const { data: existingReview } = useQuery({
    queryKey: ["order-review", id],
    queryFn: () => api.reviews.getMyOrderReview(id!),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (!existingReview) return;
    setHasExistingShopReview(true);
    setVendorRating(existingReview.rating);
    if (existingReview.comment) setComment(existingReview.comment);
  }, [existingReview]);

  const { colors } = useAppTheme();
  const styles = useThemedStyles(createRateStyles);

  const handleSubmit = async () => {
    if (!order) return;
    const riderId = order.delivery?.riderId;
    let tipCents = 0;
    if (tipAmount !== null) {
      tipCents = tipAmount * 100;
    } else if (showCustomTip && customTip.trim()) {
      const parsed = parseFloat(customTip.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed) && parsed > 0) {
        tipCents = Math.round(parsed * 100);
      }
    }
    if (
      !canSubmitOrderRating({
        shopId: order.shopId,
        existingShopReview: hasExistingShopReview,
        vendorRating,
        riderId,
        riderRating,
        tipCents,
      })
    ) {
      const needShop = Boolean(order.shopId && !hasExistingShopReview);
      const needRider = Boolean(riderId);
      let msg = "Add the required star ratings before submitting.";
      if (needShop && needRider) msg = "Please rate both the shop and your delivery.";
      else if (needShop) msg = "Please rate the shop.";
      else if (needRider) msg = "Please rate your delivery (or add an optional tip).";
      Alert.alert("Rating required", msg);
      return;
    }
    setSubmitting(true);
    try {
      if (order.shopId && vendorRating > 0 && !hasExistingShopReview) {
        await api.reviews.create({
          orderId: order.id,
          rating: vendorRating,
          comment: comment.trim() || undefined,
        });
      }
      if (riderId && riderRating > 0) {
        await api.ratings.create({
          orderId: order.id,
          toUserId: riderId,
          toRole: "rider",
          rating: riderRating,
          comment: comment.trim() || undefined,
        });
      }
      if (riderId && tipCents > 0) {
        await api.tips.create({
          orderId: order.id,
          toRiderId: riderId,
          amountCents: tipCents,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      router.replace("/(tabs)/orders");
    } catch (err: unknown) {
      Alert.alert("Error", getApiErrorMessage(err, "Failed to submit"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTipPress = (amount: number | "custom") => {
    if (amount === "custom") {
      setShowCustomTip(true);
      setTipAmount(null);
      setCustomTip("");
    } else {
      setShowCustomTip(false);
      setTipAmount(tipAmount === amount ? null : amount);
    }
  };

  if (isLoading || !order) {
    return (
      <>
        <Stack.Screen options={rateHeaderOptions(colors)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  if (order.status !== "completed") {
    return (
      <>
        <Stack.Screen options={rateHeaderOptions(colors)} />
        <View style={[styles.container, styles.center, { padding: spacing.xl }]}>
          <Text style={[styles.heading, { textAlign: "center" }]}>
            You can only rate completed orders.
          </Text>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  let tipCentsResolved = 0;
  if (tipAmount !== null) {
    tipCentsResolved = tipAmount * 100;
  } else if (showCustomTip && customTip.trim()) {
    const parsed = parseFloat(customTip.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed) && parsed > 0) {
      tipCentsResolved = Math.round(parsed * 100);
    }
  }
  const canSubmit = canSubmitOrderRating({
    shopId: order.shopId,
    existingShopReview: hasExistingShopReview,
    vendorRating,
    riderId: order.delivery?.riderId,
    riderRating,
    tipCents: tipCentsResolved,
  });

  return (
    <>
      <Stack.Screen options={rateHeaderOptions(colors)} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>How was your experience?</Text>

        {order.shopId ? (
          <>
            <Text style={styles.label}>Shop</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setVendorRating(n)}
                  style={styles.starButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={n <= vendorRating ? "star" : "star-outline"}
                    size={32}
                    color={n <= vendorRating ? colors.warning : colors.mutedForeground}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {hasExistingShopReview ? (
              <Text style={styles.helperText}>
                Your shop review is already submitted.
              </Text>
            ) : null}
          </>
        ) : null}

        {order.delivery?.riderId ? (
          <>
            <Text style={styles.label}>Delivery / Rider</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRiderRating(n)}
                  style={styles.starButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={n <= riderRating ? "star" : "star-outline"}
                    size={32}
                    color={n <= riderRating ? colors.warning : colors.mutedForeground}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Comment (optional)</Text>
        <TextInput
          style={styles.commentInput}
          placeholder="How was your order?"
          placeholderTextColor={colors.mutedForeground}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={3}
        />

        {order.delivery?.riderId ? (
          <>
            <Text style={styles.label}>Tip for rider (optional)</Text>
            <View style={styles.tipRow}>
              {[1, 2, 5].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={[
                    styles.tipButton,
                    tipAmount === amount && !showCustomTip && styles.tipButtonActive,
                  ]}
                  onPress={() => handleTipPress(amount)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tipText,
                      tipAmount === amount && !showCustomTip && styles.tipTextActive,
                    ]}
                  >
                    {formatPrice(amount * 100)}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.tipButton,
                  showCustomTip && styles.tipButtonActive,
                ]}
                onPress={() => handleTipPress("custom")}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tipText,
                    showCustomTip && styles.tipTextActive,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
            {showCustomTip ? (
              <TextInput
                style={styles.customTipInput}
                placeholder={`Enter amount (${currencySymbol})`}
                placeholderTextColor={colors.mutedForeground}
                value={customTip}
                onChangeText={setCustomTip}
                keyboardType="decimal-pad"
              />
            ) : null}
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !canSubmit}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.submitText}>Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
