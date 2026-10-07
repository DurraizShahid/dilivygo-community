"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
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
  usePlatformBranding,
} from "@dilivygo/ui";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { User } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import { GlobeLanguageMenu } from "@dilivygo/i18n/globe-language-menu";
import { tenantHostErrorTranslationKey } from "@dilivygo/api";
import { staffLoginSchema, type StaffLoginInput } from "@/lib/schemas/auth";

export default function VendorLoginPage() {
  const { t } = useTranslation("vendor");
  const { appName, helpUrl, supportEmail, wordmarkUrl } = usePlatformBranding();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const setUser = useAuthStore((s) => s.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const showLegalText = true;
  const hasWordmark = Boolean(wordmarkUrl?.trim());

  useEffect(() => {
    setMounted(true);
  }, []);

  const form = useForm<StaffLoginInput>({
    resolver: zodResolver(staffLoginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  function clearServerError() {
    if (serverError) setServerError(null);
  }

  async function onSubmit(values: StaffLoginInput) {
    setServerError(null);
    try {
      const result = await api.auth.login(values.email, values.password);
      if ("requiresTwoFactor" in result && result.requiresTwoFactor) {
        sessionStorage.setItem("dilivygo-preAuthToken", result.preAuthToken);
        toast.info(t("login.twoFactorRequired"));
        router.push("/2fa");
        return;
      }

      if (!("user" in result)) return;
      setUser(result.user as unknown as User);
      toast.success(t("login.welcomeBackToast"));
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

      const tenantKey = tenantHostErrorTranslationKey(err);
      let message: string;
      if (tenantKey) {
        message = t(tenantKey);
      } else if (statusCode === 401) {
        message = t("login.errors.invalidCredentials");
      } else if (statusCode === 429) {
        message = t("login.errors.tooManyAttempts");
      } else if (statusCode === 400) {
        const body =
          err && typeof err === "object" && "body" in err
            ? (err as { body?: { details?: { message?: string }[] } }).body
            : undefined;
        const detailMsg =
          Array.isArray(body?.details) && body.details[0]?.message
            ? body.details.map((d) => d.message).filter(Boolean).join(" ")
            : "";
        message = detailMsg || raw || t("login.errors.badRequest");
      } else if (!navigator.onLine) {
        message = t("login.errors.offline");
      } else {
        message = raw || t("login.errors.generic");
      }
      setServerError(message);
    }
  }

  const loading = form.formState.isSubmitting;
  const watchedEmail = form.watch("email");
  const watchedPassword = form.watch("password");
  const hasAnyError = !!serverError || !!form.formState.errors.email || !!form.formState.errors.password;

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
      <div className="absolute right-5 top-5 z-[90] flex items-center gap-2 pointer-events-auto">
        <ThemeToggle />
        <GlobeLanguageMenu />
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
          <source src="/vendor_login.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/20" aria-hidden />

        <Link href="/" className="absolute left-5 top-5 z-10 inline-flex items-center gap-3">
          {hasWordmark ? (
            <PlatformWordmark contrast="forDarkBackground">
              <span className="text-lg font-medium tracking-tight text-white">{appName}</span>
            </PlatformWordmark>
          ) : (
            <>
              <PlatformBrandingMark className="size-10 text-base text-white" contrast="forDarkBackground" />
              <span className="text-lg font-medium tracking-tight text-white">{appName}</span>
            </>
          )}
        </Link>

        {showLegalText ? (
          <p className="absolute bottom-5 left-5 z-10 max-w-[28rem] text-xs font-normal text-white/85">
            {t("login.legalText")}
          </p>
        ) : null}
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="relative z-10 flex min-h-[100svh] items-center justify-center px-6 py-10 lg:min-h-0 lg:px-12"
      >
        <div className="w-full max-w-xl translate-y-10 space-y-10 lg:translate-y-0">
          <motion.div variants={itemVariants} className="space-y-2 text-left">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">{t("login.welcomeBack")}</h1>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("login.formSubtitle")}</p>
          </motion.div>

          <motion.div variants={itemVariants} className="relative">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 text-left">
                <AnimatePresence mode="sync">
                  {serverError ? (
                    <motion.div
                      key="server-error"
                      role="alert"
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -10 }}
                      className="flex items-start gap-3 overflow-hidden rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <p>{serverError}</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem id="vendor-email-item" className="space-y-5">
                      <FormLabel className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80">
                        {t("login.email")}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="vendor-email"
                            type="email"
                            placeholder={t("login.emailPlaceholder")}
                            value={field.value}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              clearServerError();
                            }}
                            onBlur={field.onBlur}
                            className={`h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                            required
                            autoFocus={mounted}
                            autoComplete="email"
                            suppressHydrationWarning
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem id="vendor-password-item" className="space-y-5">
                      <FormLabel className="text-[11px] font-normal uppercase tracking-widest text-muted-foreground/80">
                        {t("login.password")}
                      </FormLabel>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <Input
                            id="vendor-password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("login.passwordPlaceholder")}
                            value={field.value}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              clearServerError();
                            }}
                            onBlur={field.onBlur}
                            className={`h-14 rounded-2xl border border-border/60 bg-background/60 pl-12 pr-11 text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background focus-visible:ring-ring/30 ${fieldState.error || serverError ? "border-destructive/60 focus-visible:ring-destructive/30" : ""}`}
                            required
                            autoComplete="current-password"
                            suppressHydrationWarning
                          />
                        </FormControl>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          suppressHydrationWarning
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </motion.button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    className="h-14 w-full rounded-full bg-foreground text-background hover:bg-foreground/90 font-medium"
                    size="lg"
                    disabled={loading || !watchedEmail || !watchedPassword}
                    aria-invalid={hasAnyError}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 size-5 animate-spin" />
                        {t("login.signingIn")}
                      </>
                    ) : (
                      <>
                        {t("login.signIn")}
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                </motion.div>
              </form>
            </Form>
          </motion.div>

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
              {helpUrl && supportEmail ? <span className="text-muted-foreground/80"> · </span> : null}
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
        </div>
      </motion.div>
    </div>
  );
}
