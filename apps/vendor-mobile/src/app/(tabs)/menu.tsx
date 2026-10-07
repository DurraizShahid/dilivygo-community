import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DIETARY_TAG_OPTIONS, type Product, type Category } from "@dilivygo/types";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import { formatPrice } from "@/lib/currency";

function createMenuStyles(c: AppColors) {
  return {
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, justifyContent: "center" as const, alignItems: "center" as const, backgroundColor: c.background },
    screenTitle: {
      fontSize: fontSize["2xl"],
      fontWeight: "700" as const,
      color: c.foreground,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
    },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
    categoriesRow: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.sm,
      flexDirection: "row" as const,
      gap: spacing.sm,
      alignItems: "center" as const,
    },
    categoriesLabel: { fontSize: fontSize.xs, color: c.mutedForeground, fontWeight: "600" as const },
    categoriesValue: { flex: 1, fontSize: fontSize.xs, color: c.mutedForeground },
    productCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
    },
    productInfo: { flex: 1, marginRight: spacing.md },
    productName: { fontSize: fontSize.base, fontWeight: "600" as const, color: c.foreground, marginBottom: 2 },
    productCategory: {
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    productTags: {
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      marginBottom: spacing.xs,
    },
    productPrice: { fontSize: fontSize.sm, fontWeight: "600" as const, color: c.foreground },
    productActions: { alignItems: "center" as const, gap: spacing.sm },
    editBtn: {
      padding: spacing.xs,
      borderRadius: borderRadius.sm,
      backgroundColor: c.muted,
    },
    fab: {
      position: "absolute" as const,
      bottom: spacing.xl,
      right: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.primary,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    empty: { alignItems: "center" as const, paddingTop: 80, gap: spacing.sm },
    emptyText: { fontSize: fontSize.lg, fontWeight: "600" as const, color: c.foreground },
    emptySubtext: { fontSize: fontSize.sm, color: c.mutedForeground },
  };
}

export default function MenuScreen() {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createMenuStyles);
  const activeShop = useShopStore((s) => s.activeShop);
  const qc = useQueryClient();
  const router = useRouter();

  const { data: catRes } = useQuery<{ categories: Category[] }>({
    queryKey: ["catalog", "categories", activeShop?.id],
    queryFn: () => api.catalog.listCategories(activeShop?.id),
    enabled: !!activeShop?.id,
  });

  const { data: res, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["vendor-products", activeShop?.id],
    queryFn: () => api.catalog.listProducts(undefined, activeShop?.id),
    enabled: !!activeShop?.id,
  });
  const products = res?.products ?? [];

  const categoryNames = (catRes?.categories ?? []).map((c) => c.name).sort();

  const toggleMutation = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      api.catalog.updateProduct(id, { available }, activeShop?.id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["vendor-products", activeShop?.id] }),
  });

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        {item.category && <Text style={styles.productCategory}>{item.category}</Text>}
        {!!item.dietaryTags?.length && (
          <Text style={styles.productTags}>
            {item.dietaryTags
              .map((tag) => DIETARY_TAG_OPTIONS.find((opt) => opt.value === tag)?.label ?? tag)
              .join(" · ")}
          </Text>
        )}
        <Text style={styles.productPrice}>{formatPrice(item.priceCents)}</Text>
      </View>
      <View style={styles.productActions}>
        <Switch
          value={item.available}
          onValueChange={() =>
            toggleMutation.mutate({ id: item.id, available: !item.available })
          }
          disabled={toggleMutation.isPending}
          trackColor={{ false: colors.border, true: colors.success + "60" }}
          thumbColor={item.available ? colors.success : colors.mutedForeground}
        />
        <TouchableOpacity
          style={styles.editBtn}
          activeOpacity={0.7}
          onPress={() => router.push(`/product/${item.id}`)}
        >
          <Ionicons name="create-outline" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.screenTitle}>Menu</Text>
      {categoryNames.length > 0 && (
        <View style={styles.categoriesRow}>
          <Text style={styles.categoriesLabel}>Categories:</Text>
          <Text style={styles.categoriesValue} numberOfLines={1}>
            {categoryNames.join(", ")}
          </Text>
        </View>
      )}
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={renderProduct}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color={colors.border} />
            <Text style={styles.emptyText}>No products yet</Text>
            <Text style={styles.emptySubtext}>Add menu items to get started</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push("/product/new")}
      >
        <Ionicons name="add" size={28} color={colors.primaryForeground} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
