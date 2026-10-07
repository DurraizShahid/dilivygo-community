import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useTranslation,
  LANGUAGE_LIST,
  type SupportedLanguage,
  type LanguageInfo,
} from "@dilivygo/i18n";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import { regionCodeToFlagEmoji } from "@/lib/flag-emoji";

function createSheetStyles(c: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: borderRadius.xl + 4,
      borderTopRightRadius: borderRadius.xl + 4,
      maxHeight: "78%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderBottomWidth: 0,
    },
    grabberWrap: {
      alignItems: "center",
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    grabber: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.mutedForeground,
      opacity: 0.35,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    sheetTitle: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.foreground,
    },
    closeHit: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    flagWrap: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    flagText: {
      fontSize: 26,
      lineHeight: 30,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowPrimary: {
      fontSize: fontSize.base,
      fontWeight: "600",
      color: c.foreground,
    },
    rowSecondary: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      marginTop: 2,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginLeft: spacing.lg + 44 + spacing.md,
    },
  });
}

export interface LanguagePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  current: SupportedLanguage;
  onSelect: (code: SupportedLanguage) => void;
  title: string;
}

export function LanguagePickerSheet({
  visible,
  onClose,
  current,
  onSelect,
  title,
}: LanguagePickerSheetProps) {
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createSheetStyles);
  const insets = useSafeAreaInsets();

  function renderItem({ item }: { item: LanguageInfo }) {
    const selected = item.code === current;
    const flag = regionCodeToFlagEmoji(item.flag);
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          onSelect(item.code as SupportedLanguage);
          onClose();
        }}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.nativeName}, ${item.name}`}
      >
        <View style={styles.flagWrap}>
          <Text style={styles.flagText}>{flag}</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowPrimary} numberOfLines={1}>
            {item.nativeName}
          </Text>
          <Text style={styles.rowSecondary} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
        ) : (
          <View style={{ width: 24 }} />
        )}
      </TouchableOpacity>
    );
  }

  const sorted = [...LANGUAGE_LIST].sort((a, b) =>
    a.nativeName.localeCompare(b.nativeName, undefined, { sensitivity: "base" }),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity
              style={styles.closeHit}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("account.close")}
            >
              <Ionicons name="close" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={sorted}
            keyExtractor={(l) => l.code}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}
