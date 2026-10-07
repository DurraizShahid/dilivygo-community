import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { useTranslation } from "@dilivygo/i18n";

export const SEARCH_PLACEHOLDER_KEYS = [
  "home.searchPlaceholderCycle0",
  "home.searchPlaceholderCycle1",
  "home.searchPlaceholderCycle2",
  "home.searchPlaceholderCycle3",
  "home.searchPlaceholderCycle4",
  "home.searchPlaceholderCycle5",
] as const;

const ROTATE_MS = 4200;
const OUT_MS = 220;
const IN_MS = 300;

/**
 * Shared animated cycling placeholder for home search (in-flow + sticky must use the same hook).
 */
export function useCyclingSearchPlaceholder() {
  const { t } = useTranslation("mobile");
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const textAnimatedStyle = useMemo(
    () => ({
      opacity,
      transform: [{ translateY }],
    }),
    [opacity, translateY]
  );

  useEffect(() => {
    const runCycle = () => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -10,
          duration: OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        const next = (indexRef.current + 1) % SEARCH_PLACEHOLDER_KEYS.length;
        indexRef.current = next;
        setIndex(next);
        translateY.setValue(12);
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            friction: 7,
            tension: 90,
            useNativeDriver: true,
          }),
        ]).start();
      });
    };

    const id = setInterval(runCycle, ROTATE_MS);
    return () => clearInterval(id);
  }, [opacity, translateY]);

  const label = t(SEARCH_PLACEHOLDER_KEYS[index]);

  return { label, textAnimatedStyle };
}
