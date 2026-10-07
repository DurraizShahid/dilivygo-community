import { View, StyleSheet } from "react-native";

/** Deterministic short strokes in a swirl / vector-field layout (no SVG dep). */
const LINE_COUNT = 100;
const lines = Array.from({ length: LINE_COUNT }, (_, i) => {
  const t = i / LINE_COUNT;
  const spiral = t * Math.PI * 5;
  const cx = 0.5 + Math.cos(spiral) * 0.36 * (1 - t * 0.35);
  const cy = 0.4 + Math.sin(spiral * 1.08) * 0.32 * (1 - t * 0.25);
  const angle = (i * 41 + spiral * 28) % 360;
  const len = 4 + (i % 14);
  const opacity = 0.05 + (i % 7) * 0.028;
  return { cx, cy, len, angle, opacity };
});

export function LoginWelcomeGraphic({ lineColor }: { lineColor: string }) {
  return (
    <View style={styles.box}>
      {lines.map((l, i) => (
        <View
          key={i}
          style={[
            styles.line,
            {
              backgroundColor: lineColor,
              left: `${l.cx * 100}%`,
              top: `${l.cy * 100}%`,
              height: l.len,
              opacity: l.opacity,
              transform: [{ rotate: `${l.angle}deg` }],
              marginTop: -l.len / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1,
    alignSelf: "center",
    position: "relative",
    marginTop: 8,
    marginBottom: 20,
  },
  line: {
    position: "absolute",
    width: 1.25,
    marginLeft: -0.625,
  },
});
