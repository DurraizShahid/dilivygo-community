"use client";

import { useEffect, useRef, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Mail, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PlatformBrandingMark,
  PlatformWordmark,
  ThemeToggle,
  useDemoMode,
  usePlatformBranding,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { getApiErrorCode } from "@dilivygo/api";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";
import { CustomerPhoneField } from "@/components/customer-phone-field";
import {
  defaultWorkspaceRef,
  sanitizeWorkspaceRef,
} from "@/lib/workspace-ref";
import { useResolvedProjectRef } from "@/lib/resolved-project-ref";
import {
  normalizePhoneToE164,
  otpContactSchema,
  otpVerifySchema,
  recoveryContactSchema,
  recoveryVerifySchema,
  type OtpContactInput,
  type OtpVerifyInput,
  type RecoveryContactInput,
  type RecoveryVerifyInput,
} from "@/lib/schemas/auth";

/** Locks `projectRef` after OTP send so verify matches even if tenant ref hydrates late. */
const DILIVYGO_OTP_PROJECT_REF_KEY = "dilivygo.customer.otp.projectRef";
const DILIVYGO_RECOVERY_PROJECT_REF_KEY = "dilivygo.customer.recovery.projectRef";

function safeSessionGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function safeSessionRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function safeLocalGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function safeLocalRemove(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function LoginPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-10 animate-spin text-primary" aria-label="Loading" />
    </div>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const resolvedTenantRef = useResolvedProjectRef();
  // Prefer an explicit `?ref=` (set when user clicked "Sign in" from a specific
  // storefront), then the runtime-resolved tenant ref from the current host
  // (`helptribepk.customer.dilivygo.com` → `helptribepk`), then the legacy env
  // fallback. This ensures OTP is always scoped to the correct organization.
  const effectiveProjectRef =
    sanitizeWorkspaceRef(searchParams.get("ref")) ??
    resolvedTenantRef ??
    defaultWorkspaceRef();

  const { appName, helpUrl, supportEmail, wordmarkUrl } = usePlatformBranding();
  const hasWordmark = Boolean(wordmarkUrl?.trim());
  const demoMode = useDemoMode();
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const setCustomer = useAuthStore((s) => s.setCustomer);
  const [step, setStep] = useState<"contact" | "otp" | "recovery_contact" | "recovery_otp">("contact");
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [recoveryDebugOtp, setRecoveryDebugOtp] = useState<string | null>(null);
  /** Server-driven error message (kept outside RHF so i18n/statusCode mapping is unchanged). */
  const [serverError, setServerError] = useState<string | null>(null);
  /** Exact `projectRef` sent to `/otp/send` / recovery send — survives tenant-ref hydration and storage failures. */
  const otpProjectRefLock = useRef<string | null>(null);
  const recoveryProjectRefLock = useRef<string | null>(null);

  const contactForm = useForm<OtpContactInput>({
    resolver: zodResolver(otpContactSchema),
    defaultValues: {
      channel: "phone",
      phone: "",
      email: "",
      phoneLinkEmail: "",
      skipOtp: false,
    },
    mode: "onSubmit",
  });

  const otpForm = useForm<OtpVerifyInput>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: { code: "" },
    mode: "onSubmit",
  });

  const recoveryContactForm = useForm<RecoveryContactInput>({
    resolver: zodResolver(recoveryContactSchema),
    defaultValues: { recoveryEmail: "", recoveryNewPhone: "" },
    mode: "onSubmit",
  });

  const recoveryVerifyForm = useForm<RecoveryVerifyInput>({
    resolver: zodResolver(recoveryVerifySchema),
    defaultValues: { recoveryCode: "" },
    mode: "onSubmit",
  });

  const channel = contactForm.watch("channel");
  const authMode = searchParams.get("mode") === "signup" ? "signup" : "login";

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  function clearServerError() {
    if (serverError) setServerError(null);
  }

  async function onSendOTP(values: OtpContactInput) {
    setServerError(null);
    try {
      const normalized = normalizePhoneToE164(values.phone);
      const normalizedEmail = values.email.trim().toLowerCase();
      if (values.channel === "phone") {
        contactForm.setValue("phone", normalized, { shouldValidate: false });
      } else {
        contactForm.setValue("email", normalizedEmail, { shouldValidate: false });
      }

      const scopeAtSend = effectiveProjectRef;

      // Demo-mode OTP bypass. Only honored when the server-reported `demoMode`
      // flag is on; the backend re-checks `platform_settings.demo_mode` and
      // returns 403 otherwise, so flipping this client-side cannot bypass OTP
      // on a real deployment.
      if (values.skipOtp && demoMode) {
        const demoResult = await api.auth.customerDemoLogin({
          channel: values.channel,
          projectRef: scopeAtSend,
          ...(values.channel === "phone"
            ? { phone: normalized }
            : { email: normalizedEmail }),
        });
        setCustomer(demoResult.customer, demoResult.token);
        router.push("/");
        return;
      }

      const result = await api.auth.sendOTP({
        channel: values.channel,
        projectRef: scopeAtSend,
        ...(values.channel === "phone" ? { phone: normalized } : { email: normalizedEmail }),
      });
      otpProjectRefLock.current = scopeAtSend;
      safeSessionSet(DILIVYGO_OTP_PROJECT_REF_KEY, scopeAtSend);
      safeLocalSet(DILIVYGO_OTP_PROJECT_REF_KEY, scopeAtSend);
      const nextDebugOtp = result.debugOtp ?? null;
      setDebugOtp(nextDebugOtp);
      otpForm.reset({ code: nextDebugOtp ?? "" });
      setStep("otp");
    } catch (err: unknown) {
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const apiCode = getApiErrorCode(err);

      let message: string;
      if (apiCode === "DEMO_MODE_DISABLED") {
        message =
          "Demo mode is disabled. Please request a verification code instead.";
      } else if (statusCode === 429) {
        message = "Too many OTP requests. Please wait a few minutes before trying again.";
      } else if (statusCode === 404 && values.channel === "email") {
        message = t("login.emailOtpSendNotFound");
      } else if (!navigator.onLine) {
        message = "You appear to be offline. Check your internet connection and try again.";
      } else {
        message = raw || "Failed to send verification code. Please try again.";
      }
      setServerError(message);
    }
  }

  async function onVerifyOTP(values: OtpVerifyInput) {
    setServerError(null);
    try {
      const contactValues = contactForm.getValues();
      const trimmedLinkEmail = contactValues.phoneLinkEmail.trim().toLowerCase();
      const projectRefForVerify =
        otpProjectRefLock.current ||
        safeSessionGet(DILIVYGO_OTP_PROJECT_REF_KEY) ||
        safeLocalGet(DILIVYGO_OTP_PROJECT_REF_KEY) ||
        effectiveProjectRef;
      const result = await api.auth.verifyOTP({
        channel: contactValues.channel,
        ...(contactValues.channel === "phone"
          ? {
              phone: contactValues.phone,
              ...(trimmedLinkEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedLinkEmail)
                ? { email: trimmedLinkEmail }
                : {}),
            }
          : { email: contactValues.email }),
        code: values.code,
        projectRef: projectRefForVerify,
      });
      otpProjectRefLock.current = null;
      safeSessionRemove(DILIVYGO_OTP_PROJECT_REF_KEY);
      safeLocalRemove(DILIVYGO_OTP_PROJECT_REF_KEY);
      setCustomer(result.customer, result.token);
      router.push("/");
    } catch (err: unknown) {
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const apiCode = getApiErrorCode(err);

      let message: string;
      if (statusCode === 429) {
        message = "Too many incorrect attempts. Please request a new code.";
      } else if (statusCode === 409) {
        message =
          raw ||
          "That email is already linked to another account. Try a different email or sign in with phone.";
      } else if (statusCode === 400) {
        if (apiCode === "OTP_NOT_FOUND") {
          message =
            "No active verification code was found for this storefront. Go back, request a new code, and stay on the same brand URL you started from. If it still fails, the server may need a shared Redis cache when more than one instance is running.";
        } else if (apiCode === "OTP_LOCKED") {
          message = "Too many incorrect attempts. Please request a new code.";
        } else if (apiCode === "OTP_MISMATCH") {
          message = "Incorrect verification code. Please check and try again.";
        } else if (raw.toLowerCase().includes("invalid code")) {
          message = "Incorrect verification code. Please check and try again.";
        } else if (raw.toLowerCase().includes("expired")) {
          message = "Your verification code has expired. Please request a new one.";
        } else if (raw.toLowerCase().includes("validation")) {
          message = raw || "Check the code format and try again.";
        } else {
          message = raw || "Incorrect verification code. Please check and try again.";
        }
      } else if (!navigator.onLine) {
        message = "You appear to be offline. Check your internet connection and try again.";
      } else {
        message = raw || "Verification failed. Please try again.";
      }
      setServerError(message);
    }
  }

  async function onSendRecoveryOTP(values: RecoveryContactInput) {
    setServerError(null);
    try {
      const normalizedEmail = values.recoveryEmail.trim().toLowerCase();
      const normalizedPhone = normalizePhoneToE164(values.recoveryNewPhone);
      recoveryContactForm.setValue("recoveryEmail", normalizedEmail, { shouldValidate: false });
      recoveryContactForm.setValue("recoveryNewPhone", normalizedPhone, { shouldValidate: false });

      const scopeAtSend = effectiveProjectRef;
      const result = await api.auth.customerRecoverySend({
        email: normalizedEmail,
        projectRef: scopeAtSend,
      });
      recoveryProjectRefLock.current = scopeAtSend;
      safeSessionSet(DILIVYGO_RECOVERY_PROJECT_REF_KEY, scopeAtSend);
      safeLocalSet(DILIVYGO_RECOVERY_PROJECT_REF_KEY, scopeAtSend);
      const nextDebugOtp = result.debugOtp ?? null;
      setRecoveryDebugOtp(nextDebugOtp);
      recoveryVerifyForm.reset({ recoveryCode: nextDebugOtp ?? "" });
      setStep("recovery_otp");
    } catch (err: unknown) {
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;

      let message: string;
      if (statusCode === 429) {
        message = "Too many recovery requests. Please wait a few minutes before trying again.";
      } else if (!navigator.onLine) {
        message = "You appear to be offline. Check your internet connection and try again.";
      } else {
        message = raw || "Failed to send recovery code. Please try again.";
      }
      setServerError(message);
    }
  }

  async function onVerifyRecoveryOTP(values: RecoveryVerifyInput) {
    setServerError(null);
    try {
      const recoveryContactValues = recoveryContactForm.getValues();
      const projectRefForRecoveryVerify =
        recoveryProjectRefLock.current ||
        safeSessionGet(DILIVYGO_RECOVERY_PROJECT_REF_KEY) ||
        safeLocalGet(DILIVYGO_RECOVERY_PROJECT_REF_KEY) ||
        effectiveProjectRef;
      const result = await api.auth.customerRecoveryVerify({
        email: recoveryContactValues.recoveryEmail,
        code: values.recoveryCode,
        newPhone: recoveryContactValues.recoveryNewPhone,
        projectRef: projectRefForRecoveryVerify,
      });
      recoveryProjectRefLock.current = null;
      safeSessionRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
      safeLocalRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
      setCustomer(result.customer, result.token);
      router.push("/");
    } catch (err: unknown) {
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;

      let message: string;
      if (statusCode === 409) {
        message = "That new phone number is already linked to another account.";
      } else if (statusCode === 429) {
        message = "Too many incorrect attempts. Please request a new recovery code.";
      } else if (statusCode === 400 && raw.toLowerCase().includes("expired")) {
        message = "Your recovery code has expired. Please request a new one.";
      } else if (statusCode === 400) {
        message = "Incorrect recovery code. Please check and try again.";
      } else if (!navigator.onLine) {
        message = "You appear to be offline. Check your internet connection and try again.";
      } else {
        message = raw || "Recovery failed. Please try again.";
      }
      setServerError(message);
    }
  }

  const contactPhone = contactForm.watch("phone");
  const contactEmail = contactForm.watch("email");
  const contactPhoneLinkEmail = contactForm.watch("phoneLinkEmail");
  const watchedRecoveryEmail = recoveryContactForm.watch("recoveryEmail");
  const watchedRecoveryNewPhone = recoveryContactForm.watch("recoveryNewPhone");

  const containerVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="relative h-[100svh] overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[1.35fr_1fr]">
      <div className="absolute right-5 top-5 z-[90] pointer-events-auto">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 overflow-hidden lg:relative lg:inset-auto">
        <video
          className="absolute inset-0 size-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src="/customer_login.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/20" aria-hidden />
        <Link
          href="/"
          className="absolute left-5 top-5 z-10 inline-flex items-center gap-3"
        >
          {hasWordmark ? (
            <PlatformWordmark contrast="forDarkBackground">
              <span className="text-lg font-medium tracking-tight text-white">{appName}</span>
            </PlatformWordmark>
          ) : (
            <>
              <PlatformBrandingMark
                className="size-10 text-base text-white"
                contrast="forDarkBackground"
              />
              <span className="text-lg font-medium tracking-tight text-white">{appName}</span>
            </>
          )}
        </Link>
        <p className="absolute bottom-5 left-5 z-10 max-w-[28rem] text-xs font-normal text-white/85">
          {t("login.legalText")}
        </p>
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="relative z-10 flex min-h-[100svh] items-center justify-center px-6 py-10 lg:min-h-0 lg:px-12"
      >
        <div className="w-full max-w-xl translate-y-10 space-y-10 lg:translate-y-0">
          <div />

          <motion.div variants={itemVariants} className="space-y-2 text-left">
            <motion.h1
              key={step}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-medium tracking-tight text-foreground"
            >
              {step === "contact"
                ? t("login.welcomeBack")
                : step === "otp"
                  ? t("login.verifyCode")
                  : step === "recovery_contact"
                    ? t("login.recoverAccount")
                    : t("login.verifyRecoveryCode")}
            </motion.h1>
            <motion.p
              key={`desc-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {step === "contact"
                ? "Sign in to access your account and start ordering."
                : "We've sent a code to your contact method."}
            </motion.p>
          </motion.div>

          <div className="relative">
            <AnimatePresence mode="sync">
                {step === "contact" ? (
                  <motion.div
                    key="contact"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Form {...contactForm}>
                      <form onSubmit={contactForm.handleSubmit(onSendOTP)} className="space-y-6 text-left">
                        <AnimatePresence>
                          {serverError && (
                            <motion.div
                              role="alert"
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              className="flex items-start gap-3 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                            >
                              <AlertCircle className="mt-0.5 size-4 shrink-0" />
                              <p>{serverError}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1 ring-1 ring-border/40">
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => {
                              contactForm.setValue("channel", "phone");
                              contactForm.setValue("phoneLinkEmail", "");
                              contactForm.clearErrors();
                              clearServerError();
                            }}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                              channel === "phone"
                                ? "bg-foreground text-background shadow-sm font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t("login.phone")}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => {
                              contactForm.setValue("channel", "email");
                              contactForm.setValue("phoneLinkEmail", "");
                              contactForm.clearErrors();
                              clearServerError();
                            }}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                              channel === "email"
                                ? "bg-foreground text-background shadow-sm font-semibold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t("login.email")}
                          </motion.button>
                        </div>

                        <AnimatePresence mode="sync">
                          {channel === "phone" ? (
                            <motion.div
                              key="phone-field"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                            >
                              <FormField
                                control={contactForm.control}
                                name="phone"
                                render={({ field, fieldState }) => (
                                  <FormItem id="customer-phone-item" className="space-y-5">
                                    <FormLabel
                                      htmlFor="customer-phone"
                                      className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                                    >
                                      {t("login.phoneNumber")}
                                    </FormLabel>
                                    <FormControl>
                                      <CustomerPhoneField
                                        id="customer-phone"
                                        value={field.value}
                                        numberPlaceholder="e.g., 300 1234567"
                                        numberInputClassName="placeholder:text-muted-foreground/70"
                                        onChange={(v) => {
                                          contactForm.setValue("phone", v, {
                                            shouldValidate: false,
                                            shouldDirty: true,
                                          });
                                          contactForm.clearErrors("phone");
                                          clearServerError();
                                        }}
                                        className="rounded-2xl border border-border/60 bg-background/60 py-6 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30"
                                        error={!!fieldState.error || !!serverError}
                                        required
                                        autoFocus
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="email-field"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                            >
                              <FormField
                                control={contactForm.control}
                                name="email"
                                render={({ field, fieldState }) => (
                                  <FormItem id="customer-email-item" className="space-y-5">
                                    <FormLabel
                                      htmlFor="customer-email"
                                      className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                                    >
                                      {t("login.emailLabel")}
                                    </FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                          id="customer-email"
                                          type="email"
                                          placeholder="you@example.com"
                                          value={field.value}
                                          onChange={(e) => {
                                            contactForm.setValue("email", e.target.value, {
                                              shouldValidate: false,
                                              shouldDirty: true,
                                            });
                                            contactForm.clearErrors("email");
                                            clearServerError();
                                          }}
                                          onBlur={field.onBlur}
                                          className={`h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                                          required
                                          autoFocus
                                          autoComplete="email"
                                        />
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>

                      {demoMode ? (
                        <FormField
                          control={contactForm.control}
                          name="skipOtp"
                          render={({ field }) => (
                            <FormItem>
                              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={field.value}
                                  onChange={(e) => {
                                    field.onChange(e.target.checked);
                                    clearServerError();
                                  }}
                                  className="size-4 rounded border-border accent-primary"
                                />
                                <span className="text-foreground/70">Demo mode</span>
                              </label>
                            </FormItem>
                          )}
                        />
                      ) : null}

                      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          type="submit"
                          className="h-14 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                          size="lg"
                          disabled={
                          contactForm.formState.isSubmitting ||
                          (channel === "phone" ? !contactPhone : !contactEmail)
                        }
                      >
                          {contactForm.formState.isSubmitting ? (
                            <>
                              <Loader2 className="mr-2 size-5 animate-spin" />
                              {demoMode && contactForm.watch("skipOtp")
                                ? "Signing in…"
                                : t("login.sendingCode")}
                            </>
                          ) : (
                            <>
                              {demoMode && contactForm.watch("skipOtp")
                                ? "Sign in (Demo)"
                                : "Continue"}{" "}
                              <ArrowRight className="ml-2 size-4" />
                            </>
                          )}
                        </Button>
                      </motion.div>

                      <div className="flex flex-col gap-4 pt-4 text-left text-sm">
                        {channel === "phone" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setStep("recovery_contact");
                              setServerError(null);
                            }}
                            className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {t("login.cantAccessPhone")}
                          </button>
                        ) : null}
                        <Link href="/" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                          Back to home
                        </Link>
                      </div>
                      </form>
                    </Form>
                  </motion.div>
                ) : step === "otp" ? (
                  <motion.div
                    key="otp"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Form {...otpForm}>
                      <form onSubmit={otpForm.handleSubmit(onVerifyOTP)} className="space-y-6">
                        <AnimatePresence>
                          {serverError && (
                            <motion.div
                              role="alert"
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              className="flex items-start gap-3 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                            >
                              <AlertCircle className="mt-0.5 size-4 shrink-0" />
                              <p>{serverError}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {debugOtp ? (
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="rounded-2xl bg-muted/40 p-4 text-left ring-1 ring-border/40"
                          >
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dev OTP</p>
                            <p className="mt-1 font-mono text-2xl tracking-[0.5em] text-foreground">
                              {debugOtp}
                            </p>
                          </motion.div>
                        ) : null}
                      <FormField
                        control={otpForm.control}
                        name="code"
                        render={({ field, fieldState }) => (
                          <FormItem id="customer-otp-item" className="space-y-4">
                            <FormLabel
                              htmlFor="customer-otp"
                              className="block text-left text-sm font-medium text-muted-foreground"
                            >
                              {t("login.verificationCode")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                id="customer-otp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                placeholder="000000"
                                value={field.value}
                                onChange={(e) => {
                                  field.onChange(e.target.value.replace(/\D/g, ""));
                                  clearServerError();
                                }}
                                onBlur={field.onBlur}
                                className={`h-16 rounded-2xl border border-border/60 bg-background/60 text-left text-3xl font-semibold tracking-[0.75em] text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                                required
                                autoFocus
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="submit"
                            className="h-14 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                            size="lg"
                            disabled={otpForm.formState.isSubmitting || otpForm.watch("code").length !== 6}
                          >
                            {otpForm.formState.isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 size-5 animate-spin" />
                                {t("login.verifying")}
                              </>
                            ) : (
                              t("login.verifyAndSignIn")
                            )}
                          </Button>
                        </motion.div>
                      <button
                        type="button"
                        onClick={() => {
                          otpProjectRefLock.current = null;
                          safeSessionRemove(DILIVYGO_OTP_PROJECT_REF_KEY);
                          safeLocalRemove(DILIVYGO_OTP_PROJECT_REF_KEY);
                          setStep("contact");
                          otpForm.reset({ code: "" });
                          setDebugOtp(null);
                          setServerError(null);
                        }}
                        className="w-full text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {channel === "phone" ? t("login.changePhoneNumber") : t("login.changeEmail")}
                      </button>
                      </form>
                    </Form>
                  </motion.div>
                ) : step === "recovery_contact" ? (
                  <motion.div
                    key="recovery-contact"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Form {...recoveryContactForm}>
                      <form onSubmit={recoveryContactForm.handleSubmit(onSendRecoveryOTP)} className="space-y-6 text-left">
                        <AnimatePresence>
                          {serverError && (
                            <motion.div
                              role="alert"
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              className="flex items-start gap-3 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                            >
                              <AlertCircle className="mt-0.5 size-4 shrink-0" />
                              <p>{serverError}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      <FormField
                        control={recoveryContactForm.control}
                        name="recoveryEmail"
                        render={({ field, fieldState }) => (
                          <FormItem className="space-y-5">
                            <FormLabel
                              htmlFor="recovery-email"
                              className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                            >
                              {t("login.accountEmail")}
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  id="recovery-email"
                                  type="email"
                                  placeholder="you@example.com"
                                  value={field.value}
                                  onChange={(e) => {
                                    recoveryContactForm.setValue("recoveryEmail", e.target.value, {
                                      shouldValidate: false,
                                      shouldDirty: true,
                                    });
                                    recoveryContactForm.clearErrors("recoveryEmail");
                                    clearServerError();
                                  }}
                                  onBlur={field.onBlur}
                                  className={`h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                                  required
                                  autoFocus
                                  autoComplete="email"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={recoveryContactForm.control}
                        name="recoveryNewPhone"
                        render={({ field, fieldState }) => (
                          <FormItem className="space-y-5">
                            <FormLabel
                              htmlFor="recovery-phone"
                              className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80"
                            >
                              {t("login.newPhoneNumber")}
                            </FormLabel>
                            <FormControl>
                              <CustomerPhoneField
                                id="recovery-phone"
                                value={field.value}
                                numberPlaceholder="e.g., 300 1234567"
                                numberInputClassName="placeholder:text-muted-foreground/70"
                                onChange={(v) => {
                                  recoveryContactForm.setValue("recoveryNewPhone", v, {
                                    shouldValidate: false,
                                    shouldDirty: true,
                                  });
                                  recoveryContactForm.clearErrors("recoveryNewPhone");
                                  clearServerError();
                                }}
                                className="rounded-2xl border border-border/60 bg-background/60 py-6 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30"
                                error={!!fieldState.error || !!serverError}
                                required
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                          <Button
                             type="submit"
                             className="h-14 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                             size="lg"
                             disabled={
                               recoveryContactForm.formState.isSubmitting ||
                               !watchedRecoveryEmail ||
                               !watchedRecoveryNewPhone
                             }
                           >
                            {recoveryContactForm.formState.isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 size-5 animate-spin" />
                                {t("login.sendingRecoveryCode")}
                              </>
                            ) : (
                              t("login.sendRecoveryCode")
                            )}
                          </Button>
                        </motion.div>
                      <button
                        type="button"
                        onClick={() => {
                          recoveryProjectRefLock.current = null;
                          safeSessionRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
                          safeLocalRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
                          setStep("contact");
                          setServerError(null);
                        }}
                        className="w-full text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("login.backToSignIn")}
                      </button>
                      </form>
                    </Form>
                  </motion.div>
                ) : (
                  <motion.div
                    key="recovery-otp"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Form {...recoveryVerifyForm}>
                      <form onSubmit={recoveryVerifyForm.handleSubmit(onVerifyRecoveryOTP)} className="space-y-6">
                        <AnimatePresence>
                          {serverError && (
                            <motion.div
                              role="alert"
                              initial={{ opacity: 0, height: 0, y: -10 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -10 }}
                              className="flex items-start gap-3 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                            >
                              <AlertCircle className="mt-0.5 size-4 shrink-0" />
                              <p>{serverError}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {recoveryDebugOtp ? (
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="rounded-2xl bg-muted/40 p-4 text-left ring-1 ring-border/40"
                          >
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dev Recovery OTP</p>
                            <p className="mt-1 font-mono text-2xl tracking-[0.5em] text-foreground">
                              {recoveryDebugOtp}
                            </p>
                          </motion.div>
                        ) : null}
                      <FormField
                        control={recoveryVerifyForm.control}
                        name="recoveryCode"
                        render={({ field, fieldState }) => (
                          <FormItem className="space-y-4">
                            <FormLabel
                              htmlFor="recovery-otp"
                              className="block text-left text-sm font-medium text-muted-foreground"
                            >
                              {t("login.verifyRecoveryCode")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                id="recovery-otp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                placeholder="000000"
                                value={field.value}
                                onChange={(e) => {
                                  field.onChange(e.target.value.replace(/\D/g, ""));
                                  clearServerError();
                                }}
                                onBlur={field.onBlur}
                                className={`h-16 rounded-2xl border border-border/60 bg-background/60 text-left text-3xl font-semibold tracking-[0.75em] text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                                required
                                autoFocus
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="submit"
                            className="h-14 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                            size="lg"
                            disabled={
                              recoveryVerifyForm.formState.isSubmitting ||
                              recoveryVerifyForm.watch("recoveryCode").length !== 6
                            }
                          >
                            {recoveryVerifyForm.formState.isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 size-5 animate-spin" />
                                {t("login.recoveringAccount")}
                              </>
                            ) : (
                              t("login.verifyAndRecover")
                            )}
                          </Button>
                        </motion.div>
                      <button
                        type="button"
                        onClick={() => {
                          recoveryProjectRefLock.current = null;
                          safeSessionRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
                          safeLocalRemove(DILIVYGO_RECOVERY_PROJECT_REF_KEY);
                          setStep("recovery_contact");
                          recoveryVerifyForm.reset({ recoveryCode: "" });
                          setRecoveryDebugOtp(null);
                          setServerError(null);
                        }}
                        className="w-full text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("login.changeEmailOrPhone")}
                      </button>
                      </form>
                    </Form>
                  </motion.div>
                )}
              </AnimatePresence>
          </div>

          {(helpUrl || supportEmail) && (
            <motion.p variants={itemVariants} className="text-left text-sm text-muted-foreground">
              {t("login.needHelp")}{" "}
              {helpUrl ? (
                <a
                  href={helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("login.helpCenter")}
                </a>
              ) : null}
              {helpUrl && supportEmail ? <span className="text-muted-foreground/70"> · </span> : null}
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {supportEmail}
                </a>
              ) : null}
            </motion.p>
          )}

          <div className="h-4" aria-hidden />
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}
