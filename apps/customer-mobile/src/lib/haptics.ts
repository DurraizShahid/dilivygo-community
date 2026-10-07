import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Success haptic after order placed / paid (no-op on web / unsupported). */
export function hapticOrderSuccess(): void {
  if (Platform.OS === "web") return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
