import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Pressable,
  Switch,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { getApiErrorCode } from "@dilivygo/api";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useAppTheme } from "@/providers/theme-provider";
import { useCurrencyStore } from "@/lib/currency";
import { fonts, spacing, borderRadius } from "@/lib/theme";
import { CustomerPhoneField } from "@/components/customer-phone-field";
import { LoginPromoBanner } from "@/components/login-promo-banner";
import { LoginWelcomeGraphic } from "@/components/login-welcome-graphic";
import { useLoginGeoCountryCode } from "@/hooks/use-login-geo-country";
import { getLoginWelcomePalette } from "@/lib/login-welcome-theme";
import { defaultWorkspaceRef } from "@/lib/workspace-ref";

const CUSTOMER_WEB_URL = process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL?.trim() || "";

function normalizePhoneToE164(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const withPlus = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const digitsAndPlusOnly = withPlus.replace(/[^\d+]/g, "");
  if (digitsAndPlusOnly.includes("+")) {
    return `+${digitsAndPlusOnly.replace(/\+/g, "")}`;
  }
  return digitsAndPlusOnly;
}

function isE164(phone: string) {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function getApiError(err: unknown): { message: string; statusCode?: number } {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message)
      : "";
  const statusCode =
    err && typeof err === "object" && "statusCode" in err
      ? (err as { statusCode?: number }).statusCode
      : undefined;
  return { message: raw, statusCode };
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation("customer");
  const setCustomer = useAuthStore((s) => s.setCustomer);
  const platformBranding = useCurrencyStore((s) => s.platformBranding);
  const platformTheme = useCurrencyStore((s) => s.platformTheme);
  const demoMode = useCurrencyStore((s) => s.demoMode);
  const geoCountryCode = useLoginGeoCountryCode();

  const { helpUrl, supportEmail } = platformBranding;
  const showBackToHome = true;
  const showLegalText = true;

  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<
    | "welcome"
    | "contact"
    | "otp"
    | "recovery_contact"
    | "recovery_otp"
  >("welcome");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLinkEmail, setPhoneLinkEmail] = useState("");
  const [code, setCode] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryNewPhone, setRecoveryNewPhone] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryDebugOtp, setRecoveryDebugOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipOtp, setSkipOtp] = useState(false);

  async function handleSendOTP() {
    setError(null);
    setLoading(true);
    try {
      const normalized = normalizePhoneToE164(phone);
      let normalizedEmail = "";

      if (channel === "phone") {
        if (!isE164(normalized)) {
          setError(
            "Enter your phone in international format, e.g. +447700900000"
          );
          return;
        }
        setPhone(normalized);
      } else {
        normalizedEmail = email.trim().toLowerCase();
        if (
          !normalizedEmail ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
          setError("Enter a valid email address.");
          return;
        }
        setEmail(normalizedEmail);
      }

      if (skipOtp && demoMode) {
        // Demo-mode OTP bypass. The server hard-gates this on
        // `platform_settings.demo_mode` and returns 403 otherwise, so flipping
        // this locally cannot bypass OTP on a real deployment.
        const demoResult = await api.auth.customerDemoLogin({
          channel,
          projectRef: defaultWorkspaceRef(),
          ...(channel === "phone"
            ? { phone: normalized }
            : { email: normalizedEmail }),
        });
        await setCustomer(demoResult.customer, demoResult.token);
        router.replace("/(tabs)");
        return;
      }

      const result = await api.auth.sendOTP({
        channel,
        projectRef: defaultWorkspaceRef(),
        ...(channel === "phone"
          ? { phone: normalized }
          : { email: normalizedEmail }),
      });
      const nextDebugOtp = result.debugOtp ?? null;
      setDebugOtp(nextDebugOtp);
      setCode(nextDebugOtp ?? "");
      setStep("otp");
    } catch (err: unknown) {
      const { message: raw, statusCode } = getApiError(err);
      const apiCode = getApiErrorCode(err);
      let message: string;
      if (apiCode === "DEMO_MODE_DISABLED") {
        message =
          "Demo mode is disabled. Please request a verification code instead.";
      } else if (statusCode === 429) {
        message =
          "Too many OTP requests. Please wait a few minutes before trying again.";
      } else if (statusCode === 404 && channel === "email") {
        message = t("login.emailOtpSendNotFound");
      } else {
        message = raw || "Failed to send verification code. Please try again.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    setError(null);
    if (code.length !== 6) {
      setError("Incorrect verification code. Please check and try again.");
      return;
    }
    setLoading(true);
    try {
      const trimmedLinkEmail = phoneLinkEmail.trim().toLowerCase();
      const result = await api.auth.verifyOTP({
        channel,
        ...(channel === "phone"
          ? {
              phone,
              ...(trimmedLinkEmail &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedLinkEmail)
                ? { email: trimmedLinkEmail }
                : {}),
            }
          : { email }),
        code,
        projectRef: defaultWorkspaceRef(),
      });
      await setCustomer(result.customer, result.token);
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const { message: raw, statusCode } = getApiError(err);
      let message: string;
      if (statusCode === 429) {
        message =
          "Too many incorrect attempts. Please request a new code.";
      } else if (
        statusCode === 400 &&
        raw.toLowerCase().includes("expired")
      ) {
        message =
          "Your verification code has expired. Please request a new one.";
      } else if (statusCode === 409) {
        message =
          raw ||
          "That email is already linked to another account. Try a different email or sign in with phone.";
      } else if (statusCode === 400) {
        message =
          "Incorrect verification code. Please check and try again.";
      } else {
        message = raw || "Verification failed. Please try again.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRecoveryOTP() {
    setError(null);
    setLoading(true);
    try {
      const normalizedEmail = recoveryEmail.trim().toLowerCase();
      const normalizedPhone = normalizePhoneToE164(recoveryNewPhone);

      if (
        !normalizedEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ) {
        setError("Enter a valid email address.");
        return;
      }
      if (!isE164(normalizedPhone)) {
        setError(
          "Enter your new phone in international format, e.g. +447700900000"
        );
        return;
      }

      setRecoveryEmail(normalizedEmail);
      setRecoveryNewPhone(normalizedPhone);

      const result = await api.auth.customerRecoverySend({
        email: normalizedEmail,
        projectRef: defaultWorkspaceRef(),
      });
      const nextDebugOtp = result.debugOtp ?? null;
      setRecoveryDebugOtp(nextDebugOtp);
      setRecoveryCode(nextDebugOtp ?? "");
      setStep("recovery_otp");
    } catch (err: unknown) {
      const { message: raw, statusCode } = getApiError(err);
      let message: string;
      if (statusCode === 429) {
        message =
          "Too many recovery requests. Please wait a few minutes before trying again.";
      } else {
        message = raw || "Failed to send recovery code. Please try again.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyRecoveryOTP() {
    setError(null);
    if (recoveryCode.length !== 6) {
      setError("Incorrect recovery code. Please check and try again.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.auth.customerRecoveryVerify({
        email: recoveryEmail,
        code: recoveryCode,
        newPhone: recoveryNewPhone,
        projectRef: defaultWorkspaceRef(),
      });
      await setCustomer(result.customer, result.token);
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const { message: raw, statusCode } = getApiError(err);
      let message: string;
      if (statusCode === 409) {
        message =
          "That new phone number is already linked to another account.";
      } else if (statusCode === 429) {
        message =
          "Too many incorrect attempts. Please request a new recovery code.";
      } else if (
        statusCode === 400 &&
        raw.toLowerCase().includes("expired")
      ) {
        message =
          "Your recovery code has expired. Please request a new one.";
      } else if (statusCode === 400) {
        message =
          "Incorrect recovery code. Please check and try again.";
      } else {
        message = raw || "Recovery failed. Please try again.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const welcomePalette = useMemo(
    () =>
      getLoginWelcomePalette(
        isDark,
        isDark ? platformTheme?.dark : platformTheme?.light,
      ),
    [isDark, platformTheme],
  );

  const openTerms = useCallback(() => {
    const base = CUSTOMER_WEB_URL.replace(/\/$/, "");
    if (base) void Linking.openURL(`${base}/terms`);
    else if (helpUrl) void Linking.openURL(helpUrl);
  }, [helpUrl]);

  const openPrivacy = useCallback(() => {
    const base = CUSTOMER_WEB_URL.replace(/\/$/, "");
    if (base) void Linking.openURL(`${base}/privacy`);
    else if (helpUrl) void Linking.openURL(helpUrl);
  }, [helpUrl]);

  const headerBack = useCallback(() => {
    if (step === "otp") {
      setStep("contact");
      setCode("");
      setDebugOtp(null);
      setError(null);
    } else if (step === "contact") {
      setStep("welcome");
      setError(null);
    } else if (step === "recovery_otp") {
      setStep("recovery_contact");
      setRecoveryCode("");
      setRecoveryDebugOtp(null);
      setError(null);
    } else if (step === "recovery_contact") {
      setStep("contact");
      setRecoveryEmail("");
      setRecoveryNewPhone("");
      setError(null);
    }
  }, [step]);

  if (step === "welcome") {
    return (
      <View
        style={[styles.welcomeRoot, { backgroundColor: welcomePalette.screenBg }]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <ScrollView
          contentContainerStyle={[
            styles.welcomeScrollInner,
            {
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 24,
              paddingHorizontal: spacing.xl,
              minHeight: windowHeight - insets.top - insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showBackToHome && CUSTOMER_WEB_URL ? (
            <Pressable
              onPress={() => Linking.openURL(CUSTOMER_WEB_URL)}
              style={styles.welcomeWebBack}
              hitSlop={12}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={welcomePalette.secondaryText}
              />
            </Pressable>
          ) : (
            <View style={styles.welcomeWebBackSpacer} />
          )}
          <View style={styles.welcomeHeroBlock}>
            <LoginWelcomeGraphic lineColor={welcomePalette.graphicLines} />
            <Text
              style={[styles.welcomeHeadline, { color: welcomePalette.primaryText }]}
            >
              {t("login.welcomeTitle")}
            </Text>
            <Text
              style={[styles.welcomeTagline, { color: welcomePalette.secondaryText }]}
            >
              {t("login.welcomeSubtitle")}
            </Text>
          </View>
          <View style={styles.welcomeActions}>
            <TouchableOpacity
              style={[
                styles.welcomePrimaryBtn,
                { backgroundColor: welcomePalette.primaryBtnBg },
              ]}
              onPress={() => {
                setChannel("phone");
                setPhoneLinkEmail("");
                setStep("contact");
                setError(null);
              }}
              activeOpacity={0.88}
            >
              <Text
                style={[
                  styles.welcomePrimaryBtnText,
                  { color: welcomePalette.primaryBtnText },
                ]}
              >
                {t("login.continueWithPhone")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.welcomeSecondaryBtn,
                { backgroundColor: welcomePalette.secondaryBtnBg },
              ]}
              onPress={() => {
                setChannel("email");
                setPhoneLinkEmail("");
                setStep("contact");
                setError(null);
              }}
              activeOpacity={0.88}
            >
              <Ionicons
                name="mail-outline"
                size={22}
                color={welcomePalette.secondaryBtnText}
              />
              <Text
                style={[
                  styles.welcomeSecondaryBtnText,
                  { color: welcomePalette.secondaryBtnText },
                ]}
              >
                {t("login.continueWithEmail")}
              </Text>
            </TouchableOpacity>
            {showLegalText ? (
              <Text
                style={[styles.welcomeLegal, { color: welcomePalette.legalMuted }]}
              >
                {t("login.welcomeLegalPrefix")}
                <Text
                  style={[
                    styles.welcomeLegalLink,
                    { color: welcomePalette.linkText },
                  ]}
                  onPress={openTerms}
                >
                  {t("footer.termsOfService")}
                </Text>
                {t("login.welcomeLegalMiddle")}
                <Text
                  style={[
                    styles.welcomeLegalLink,
                    { color: welcomePalette.linkText },
                  ]}
                  onPress={openPrivacy}
                >
                  {t("footer.privacyPolicy")}
                </Text>
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    );
  }

  const formTitle =
    step === "contact"
      ? t("login.welcomeBack")
      : step === "otp"
        ? t("login.verifyCode")
        : step === "recovery_contact"
          ? t("login.recoverAccount")
          : t("login.verifyRecoveryCode");

  const formSubtitle =
    step === "contact"
      ? channel === "phone"
        ? t("login.signInWithPhone")
        : t("login.signInWithEmail")
      : step === "otp"
        ? channel === "phone"
          ? t("login.enterOtpPhone")
          : t("login.enterOtpEmail")
        : step === "recovery_contact"
          ? t("login.recoveryContactDesc")
          : t("login.recoveryOtpDesc");

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: welcomePalette.screenBg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={[
          styles.screenHeader,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: spacing.lg,
          },
        ]}
      >
        <View style={styles.loginStepHeaderRow}>
          <View style={styles.loginHeaderSide}>
            <Pressable
              onPress={headerBack}
              style={styles.loginStepBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={welcomePalette.primaryText}
              />
            </Pressable>
          </View>
          <Text
            style={[styles.loginStepTitle, { color: welcomePalette.primaryText }]}
            numberOfLines={1}
          >
            {t("login.signInTitle")}
          </Text>
          <View style={[styles.loginHeaderSide, styles.loginHeaderSideEnd]}>
            {showBackToHome && CUSTOMER_WEB_URL ? (
              <Pressable
                onPress={() => Linking.openURL(CUSTOMER_WEB_URL)}
                style={styles.loginWebLinkCompact}
              >
                <Text
                  style={[
                    styles.loginWebLinkCompactText,
                    { color: welcomePalette.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {t("login.backToHome")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollFill}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: spacing.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: welcomePalette.cardBg,
              borderColor: welcomePalette.cardBorder,
            },
          ]}
        >
          <LoginPromoBanner placement="login" />

          <Text
            style={[styles.formTitle, { color: welcomePalette.primaryText }]}
          >
            {formTitle}
          </Text>
          <Text
            style={[
              styles.formSubtitle,
              { color: welcomePalette.secondaryText },
            ]}
          >
            {formSubtitle}
          </Text>

          {step === "contact" ? (
            <View style={styles.formBlock}>
              {error ? (
                <View
                  style={[
                    styles.alert,
                    {
                      borderColor: `${colors.destructive}4d`,
                      backgroundColor: `${colors.destructive}0d`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={18}
                    color={colors.destructive}
                    style={styles.alertIcon}
                  />
                  <Text style={[styles.alertText, { color: colors.destructive }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <View
                style={[
                  styles.segment,
                  { backgroundColor: welcomePalette.mutedFill },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.segmentItem,
                    channel === "phone" && {
                      backgroundColor: welcomePalette.screenBg,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 2,
                      elevation: 1,
                    },
                  ]}
                  onPress={() => {
                    setChannel("phone");
                    setPhoneLinkEmail("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          channel === "phone"
                            ? welcomePalette.primaryText
                            : welcomePalette.secondaryText,
                      },
                    ]}
                  >
                    {t("login.phone")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentItem,
                    channel === "email" && {
                      backgroundColor: welcomePalette.screenBg,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 2,
                      elevation: 1,
                    },
                  ]}
                  onPress={() => {
                    setChannel("email");
                    setPhoneLinkEmail("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          channel === "email"
                            ? welcomePalette.primaryText
                            : welcomePalette.secondaryText,
                      },
                    ]}
                  >
                    {t("login.email")}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: welcomePalette.primaryText }]}>
                {channel === "phone"
                  ? t("login.phoneNumber")
                  : t("login.emailLabel")}
              </Text>

              {channel === "phone" ? (
                <>
                  <CustomerPhoneField
                    value={phone}
                    onChange={(v) => {
                      setPhone(v);
                      if (error) setError(null);
                    }}
                    geoCountryCode={geoCountryCode}
                    error={!!error}
                    autoFocus
                    placeholder={t("login.phoneNumber")}
                  />
                  <Text
                    style={[
                      styles.label,
                      {
                        color: welcomePalette.primaryText,
                        marginTop: spacing.md,
                      },
                    ]}
                  >
                    {t("login.optionalEmailLabel")}
                  </Text>
                  <View
                    style={[
                      styles.emailRow,
                      {
                        borderColor: error ? colors.destructive : welcomePalette.cardBorder,
                        backgroundColor: welcomePalette.mutedFill,
                      },
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={welcomePalette.secondaryText}
                      style={styles.emailIcon}
                    />
                    <TextInput
                      style={[
                        styles.emailInput,
                        { color: welcomePalette.primaryText, fontFamily: fonts.regular },
                      ]}
                      placeholder="you@example.com"
                      placeholderTextColor={welcomePalette.secondaryText}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      value={phoneLinkEmail}
                      onChangeText={(v) => {
                        setPhoneLinkEmail(v);
                        if (error) setError(null);
                      }}
                    />
                  </View>
                  <Text
                    style={[
                      styles.emailChannelHint,
                      { color: welcomePalette.secondaryText },
                    ]}
                  >
                    {t("login.optionalEmailHint")}
                  </Text>
                </>
              ) : (
                <View
                  style={[
                    styles.emailRow,
                    {
                      borderColor: error ? colors.destructive : welcomePalette.cardBorder,
                      backgroundColor: welcomePalette.mutedFill,
                    },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={welcomePalette.secondaryText}
                    style={styles.emailIcon}
                  />
                  <TextInput
                    style={[
                      styles.emailInput,
                      { color: welcomePalette.primaryText, fontFamily: fonts.regular },
                    ]}
                    placeholder="you@example.com"
                    placeholderTextColor={welcomePalette.secondaryText}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      if (error) setError(null);
                    }}
                  />
                </View>
              )}

              {channel === "email" ? (
                <Text
                  style={[
                    styles.emailChannelHint,
                    { color: welcomePalette.secondaryText, marginTop: spacing.sm },
                  ]}
                >
                  {t("login.emailSignInHint")}
                </Text>
              ) : null}

              {demoMode ? (
                <View
                  style={[
                    styles.demoModeRow,
                    {
                      backgroundColor: welcomePalette.mutedFill,
                      borderColor: welcomePalette.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.demoModeText}>
                    <Text
                      style={[
                        styles.demoModeTitle,
                        { color: welcomePalette.primaryText, fontFamily: fonts.semibold },
                      ]}
                    >
                      Skip OTP (Demo mode only)
                    </Text>
                    <Text
                      style={[
                        styles.demoModeHint,
                        { color: welcomePalette.secondaryText, fontFamily: fonts.regular },
                      ]}
                    >
                      Creates your account without a verification code.
                    </Text>
                  </View>
                  <Switch
                    value={skipOtp}
                    onValueChange={(v) => {
                      setSkipOtp(v);
                      if (error) setError(null);
                    }}
                    trackColor={{
                      false: welcomePalette.cardBorder,
                      true: welcomePalette.primaryBtnBg,
                    }}
                    thumbColor={welcomePalette.primaryBtnText}
                    disabled={loading}
                  />
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: welcomePalette.primaryBtnBg,
                    opacity:
                      loading || (channel === "phone" ? !phone : !email)
                        ? 0.55
                        : 1,
                  },
                ]}
                onPress={handleSendOTP}
                disabled={
                  loading || (channel === "phone" ? !phone : !email)
                }
              >
                {loading ? (
                  <ActivityIndicator color={welcomePalette.primaryBtnText} />
                ) : (
                  <View style={styles.primaryBtnInner}>
                    <Text
                      style={[
                        styles.primaryBtnText,
                        { color: welcomePalette.primaryBtnText },
                      ]}
                    >
                      {demoMode && skipOtp
                        ? "Sign in (skip OTP)"
                        : t("login.continue")}
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color={welcomePalette.primaryBtnText}
                    />
                  </View>
                )}
              </TouchableOpacity>

              {channel === "phone" ? (
                <TouchableOpacity
                  style={styles.textLinkWrap}
                  onPress={() => {
                    setStep("recovery_contact");
                    setError(null);
                  }}
                >
                  <Text
                    style={[
                      styles.textLink,
                      { color: welcomePalette.secondaryText },
                    ]}
                  >
                    {t("login.cantAccessPhone")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : step === "otp" ? (
            <View style={styles.formBlock}>
              {error ? (
                <View
                  style={[
                    styles.alert,
                    {
                      borderColor: `${colors.destructive}4d`,
                      backgroundColor: `${colors.destructive}0d`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={18}
                    color={colors.destructive}
                    style={styles.alertIcon}
                  />
                  <Text style={[styles.alertText, { color: colors.destructive }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {debugOtp ? (
                <View
                  style={[
                    styles.debugBox,
                    { backgroundColor: welcomePalette.mutedFill },
                  ]}
                >
                  <Text
                    style={[
                      styles.debugLabel,
                      { color: welcomePalette.secondaryText },
                    ]}
                  >
                    Dev OTP (local only):{" "}
                  </Text>
                  <Text
                    style={[
                      styles.debugCode,
                      { color: welcomePalette.primaryText, fontFamily: fonts.medium },
                    ]}
                  >
                    {debugOtp}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.label, { color: welcomePalette.primaryText }]}>
                {t("login.verificationCode")}
              </Text>
              <TextInput
                style={[
                  styles.otpInput,
                  {
                    color: welcomePalette.primaryText,
                    borderColor: error ? colors.destructive : welcomePalette.cardBorder,
                    backgroundColor: welcomePalette.mutedFill,
                    fontFamily: fonts.semibold,
                  },
                ]}
                placeholder="000000"
                placeholderTextColor={welcomePalette.secondaryText}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(v) => {
                  setCode(v.replace(/\D/g, ""));
                  if (error) setError(null);
                }}
                textAlign="center"
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: welcomePalette.primaryBtnBg,
                    opacity: loading || code.length !== 6 ? 0.55 : 1,
                  },
                ]}
                onPress={handleVerifyOTP}
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator color={welcomePalette.primaryBtnText} />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: welcomePalette.primaryBtnText },
                    ]}
                  >
                    {t("login.verifyAndSignIn")}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textLinkWrap}
                onPress={() => {
                  setStep("contact");
                  setCode("");
                  setDebugOtp(null);
                  setError(null);
                }}
              >
                <Text
                  style={[styles.textLink, { color: welcomePalette.secondaryText }]}
                >
                  {channel === "phone"
                    ? t("login.changePhoneNumber")
                    : t("login.changeEmail")}
                </Text>
              </TouchableOpacity>
              {channel === "phone" && phoneLinkEmail.trim() ? (
                <Text
                  style={[
                    styles.emailChannelHint,
                    {
                      color: welcomePalette.secondaryText,
                      textAlign: "center",
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  {t("login.optionalEmailOtpReminder")}
                </Text>
              ) : null}
            </View>
          ) : step === "recovery_contact" ? (
            <View style={styles.formBlock}>
              {error ? (
                <View
                  style={[
                    styles.alert,
                    {
                      borderColor: `${colors.destructive}4d`,
                      backgroundColor: `${colors.destructive}0d`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={18}
                    color={colors.destructive}
                    style={styles.alertIcon}
                  />
                  <Text style={[styles.alertText, { color: colors.destructive }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.label, { color: welcomePalette.primaryText }]}>
                {t("login.accountEmail")}
              </Text>
              <View
                style={[
                  styles.emailRow,
                  {
                    borderColor: error ? colors.destructive : welcomePalette.cardBorder,
                    backgroundColor: welcomePalette.mutedFill,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={welcomePalette.secondaryText}
                  style={styles.emailIcon}
                />
                <TextInput
                  style={[
                    styles.emailInput,
                    { color: welcomePalette.primaryText, fontFamily: fonts.regular },
                  ]}
                  placeholder="you@example.com"
                  placeholderTextColor={welcomePalette.secondaryText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  value={recoveryEmail}
                  onChangeText={(v) => {
                    setRecoveryEmail(v);
                    if (error) setError(null);
                  }}
                />
              </View>

              <Text
                style={[
                  styles.label,
                  { color: welcomePalette.primaryText, marginTop: spacing.md },
                ]}
              >
                {t("login.newPhoneNumber")}
              </Text>
              <CustomerPhoneField
                value={recoveryNewPhone}
                onChange={(v) => {
                  setRecoveryNewPhone(v);
                  if (error) setError(null);
                }}
                geoCountryCode={geoCountryCode}
                error={!!error}
                placeholder={t("login.phoneNumber")}
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: welcomePalette.primaryBtnBg,
                    opacity:
                      loading || !recoveryEmail || !recoveryNewPhone ? 0.55 : 1,
                  },
                ]}
                onPress={handleSendRecoveryOTP}
                disabled={loading || !recoveryEmail || !recoveryNewPhone}
              >
                {loading ? (
                  <ActivityIndicator color={welcomePalette.primaryBtnText} />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: welcomePalette.primaryBtnText },
                    ]}
                  >
                    {t("login.sendRecoveryCode")}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textLinkWrap}
                onPress={() => {
                  setStep("contact");
                  setError(null);
                }}
              >
                <Text
                  style={[styles.textLink, { color: welcomePalette.secondaryText }]}
                >
                  {t("login.backToSignIn")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formBlock}>
              {error ? (
                <View
                  style={[
                    styles.alert,
                    {
                      borderColor: `${colors.destructive}4d`,
                      backgroundColor: `${colors.destructive}0d`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={18}
                    color={colors.destructive}
                    style={styles.alertIcon}
                  />
                  <Text style={[styles.alertText, { color: colors.destructive }]}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {recoveryDebugOtp ? (
                <View
                  style={[
                    styles.debugBox,
                    { backgroundColor: welcomePalette.mutedFill },
                  ]}
                >
                  <Text
                    style={[
                      styles.debugLabel,
                      { color: welcomePalette.secondaryText },
                    ]}
                  >
                    Dev recovery OTP (local only):{" "}
                  </Text>
                  <Text
                    style={[
                      styles.debugCode,
                      { color: welcomePalette.primaryText, fontFamily: fonts.medium },
                    ]}
                  >
                    {recoveryDebugOtp}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.label, { color: welcomePalette.primaryText }]}>
                {t("login.verifyRecoveryCode")}
              </Text>
              <TextInput
                style={[
                  styles.otpInput,
                  {
                    color: welcomePalette.primaryText,
                    borderColor: error ? colors.destructive : welcomePalette.cardBorder,
                    backgroundColor: welcomePalette.mutedFill,
                    fontFamily: fonts.semibold,
                  },
                ]}
                placeholder="000000"
                placeholderTextColor={welcomePalette.secondaryText}
                keyboardType="number-pad"
                maxLength={6}
                value={recoveryCode}
                onChangeText={(v) => {
                  setRecoveryCode(v.replace(/\D/g, ""));
                  if (error) setError(null);
                }}
                textAlign="center"
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  {
                    backgroundColor: welcomePalette.primaryBtnBg,
                    opacity:
                      loading || recoveryCode.length !== 6 ? 0.55 : 1,
                  },
                ]}
                onPress={handleVerifyRecoveryOTP}
                disabled={loading || recoveryCode.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator color={welcomePalette.primaryBtnText} />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: welcomePalette.primaryBtnText },
                    ]}
                  >
                    {t("login.verifyAndRecover")}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textLinkWrap}
                onPress={() => {
                  setStep("recovery_contact");
                  setRecoveryCode("");
                  setRecoveryDebugOtp(null);
                  setError(null);
                }}
              >
                <Text
                  style={[styles.textLink, { color: welcomePalette.secondaryText }]}
                >
                  {t("login.changeEmailOrPhone")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {(helpUrl || supportEmail) && (
            <Text
              style={[
                styles.helpFooter,
                { color: welcomePalette.secondaryText },
              ]}
            >
              {t("login.needHelp")}{" "}
              {helpUrl ? (
                <Text
                  style={[styles.helpLink, { color: welcomePalette.linkText }]}
                  onPress={() => Linking.openURL(helpUrl)}
                >
                  {t("login.helpCenter")}
                </Text>
              ) : null}
              {helpUrl && supportEmail ? (
                <Text style={{ color: welcomePalette.secondaryText }}> · </Text>
              ) : null}
              {supportEmail ? (
                <Text
                  style={[styles.helpLink, { color: welcomePalette.linkText }]}
                  onPress={() =>
                    Linking.openURL(`mailto:${supportEmail}`)
                  }
                >
                  {supportEmail}
                </Text>
              ) : null}
            </Text>
          )}

          {showLegalText ? (
            <Text
              style={[
                styles.legal,
                { color: welcomePalette.secondaryText },
              ]}
            >
              {t("login.legalText")}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  welcomeRoot: { flex: 1 },
  welcomeScrollInner: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  welcomeWebBack: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    marginBottom: 4,
  },
  welcomeWebBackSpacer: {
    height: 32,
  },
  welcomeHeroBlock: {
    alignItems: "center",
    paddingTop: 8,
    flexShrink: 0,
  },
  welcomeHeadline: {
    fontSize: 34,
    fontFamily: fonts.extrabold,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 4,
  },
  welcomeTagline: {
    fontSize: 16,
    fontFamily: fonts.regular,
    marginTop: 10,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
  welcomeActions: {
    width: "100%",
    gap: 12,
    marginTop: 32,
    paddingTop: 8,
  },
  welcomePrimaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomePrimaryBtnText: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    fontWeight: "600",
  },
  welcomeSecondaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  welcomeSecondaryBtnText: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    fontWeight: "600",
  },
  welcomeLegal: {
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 20,
    paddingHorizontal: spacing.sm,
  },
  welcomeLegalLink: {
    fontFamily: fonts.semibold,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  screenHeader: {
    width: "100%",
  },
  loginStepHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
    minHeight: 44,
  },
  loginHeaderSide: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
  },
  loginHeaderSideEnd: {
    justifyContent: "flex-end",
  },
  loginStepBack: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  loginStepTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: fonts.semibold,
    fontWeight: "600",
  },
  loginWebLinkCompact: {
    maxWidth: 88,
    alignItems: "flex-end",
  },
  loginWebLinkCompactText: {
    fontSize: 12,
    fontFamily: fonts.regular,
  },
  scrollFill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: borderRadius.xl + 8,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  formTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  formSubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  formBlock: { width: "100%" },
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  alertIcon: { marginTop: 1 },
  alertText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  segment: {
    flexDirection: "row",
    borderRadius: borderRadius.lg,
    padding: 4,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 14, fontFamily: fonts.semibold, fontWeight: "600" },
  label: {
    fontSize: 14,
    fontFamily: fonts.medium,
    fontWeight: "500",
    marginBottom: 8,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    minHeight: 44,
    marginBottom: spacing.md,
  },
  emailIcon: { marginLeft: 14 },
  emailInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    paddingRight: 14,
  },
  emailChannelHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  demoModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  demoModeText: {
    flex: 1,
  },
  demoModeTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  demoModeHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  primaryBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    fontWeight: "600",
  },
  textLinkWrap: { marginTop: spacing.lg, alignItems: "center" },
  textLink: { fontSize: 14, fontFamily: fonts.regular },
  debugBox: {
    borderRadius: borderRadius.lg,
    padding: 12,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  debugLabel: { fontSize: 12, textAlign: "center" },
  debugCode: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 4,
    marginTop: 4,
  },
  otpInput: {
    width: "100%",
    minHeight: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    fontSize: 22,
    letterSpacing: 8,
    marginBottom: spacing.md,
  },
  helpFooter: {
    marginTop: spacing.xl,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  helpLink: {
    fontFamily: fonts.semibold,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  legal: {
    marginTop: spacing.lg,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
});
