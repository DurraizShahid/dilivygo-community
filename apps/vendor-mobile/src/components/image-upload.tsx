import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { API_BASE_URL } from "@/lib/api";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

function createImageUploadStyles(c: AppColors) {
  return {
    container: { gap: spacing.xs },
    label: { fontSize: fontSize.sm, fontWeight: "600" as const, color: c.foreground },
    uploadArea: {
      borderWidth: 2,
      borderColor: c.border,
      borderStyle: "dashed" as const,
      borderRadius: borderRadius.lg,
      overflow: "hidden" as const,
      backgroundColor: c.muted,
      minHeight: 180,
    },
    uploadAreaWithImage: {
      borderStyle: "solid" as const,
      borderWidth: 1,
    },
    uploadPlaceholder: {
      flex: 1,
      minHeight: 180,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      gap: spacing.sm,
      padding: spacing.xl,
    },
    uploadTitle: {
      fontSize: fontSize.base,
      fontWeight: "600" as const,
      color: c.foreground,
    },
    uploadText: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
    },
    uploadSubtext: {
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    imageContainer: {
      position: "relative" as const,
    },
    preview: {
      width: "100%" as const,
      height: 200,
    },
    overlay: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0,0,0,0.45)",
      paddingVertical: spacing.sm,
      alignItems: "center" as const,
    },
    overlayButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: spacing.xs,
    },
    overlayText: {
      color: "#fff",
      fontWeight: "600" as const,
      fontSize: fontSize.sm,
    },
  };
}

export function MobileImageUpload({ value, onChange, disabled = false }: ImageUploadProps) {
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createImageUploadStyles);
  const [uploading, setUploading] = useState(false);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant photo library access to upload images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const uri = asset.uri;
      const filename = uri.split("/").pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1] === "jpg" ? "jpeg" : match[1]}` : "image/jpeg";

      const formData = new FormData();
      formData.append("image", { uri, name: filename, type } as unknown as Blob);

      const response = await fetch(`${API_BASE_URL}/api/uploads/product-image`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Upload failed");
      }

      const data = (await response.json()) as { url: string };
      onChange(data.url);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Upload failed";
      Alert.alert("Upload Error", message);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera access to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const uri = asset.uri;
      const filename = uri.split("/").pop() || "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1] === "jpg" ? "jpeg" : match[1]}` : "image/jpeg";

      const formData = new FormData();
      formData.append("image", { uri, name: filename, type } as unknown as Blob);

      const response = await fetch(`${API_BASE_URL}/api/uploads/product-image`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Upload failed");
      }

      const data = (await response.json()) as { url: string };
      onChange(data.url);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Upload failed";
      Alert.alert("Upload Error", message);
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handlePress = useCallback(() => {
    if (disabled || uploading) return;

    Alert.alert("Add Image", "Choose how to add an image", [
      { text: "Photo Library", onPress: pickImage },
      { text: "Take Photo", onPress: takePhoto },
      ...(value ? [{ text: "Remove", style: "destructive" as const, onPress: () => onChange(null) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }, [disabled, uploading, value, pickImage, takePhoto, onChange]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Product Image</Text>
      <TouchableOpacity
        style={[styles.uploadArea, value ? styles.uploadAreaWithImage : null]}
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={disabled || uploading}
      >
        {uploading ? (
          <View style={styles.uploadPlaceholder}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.uploadText}>Uploading...</Text>
          </View>
        ) : value ? (
          <View style={styles.imageContainer}>
            <Image source={{ uri: value }} style={styles.preview} resizeMode="cover" />
            <View style={styles.overlay}>
              <View style={styles.overlayButton}>
                <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                <Text style={styles.overlayText}>Change</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Ionicons name="image-outline" size={40} color={colors.mutedForeground} />
            <Text style={styles.uploadTitle}>Tap to add image</Text>
            <Text style={styles.uploadSubtext}>PNG, JPEG, WebP or GIF</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}
