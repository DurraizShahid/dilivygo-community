"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Lock, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@dilivygo/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { User } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import {
  isTenantHostMismatchError,
  tenantHostErrorTranslationKey,
} from "@dilivygo/api";
import { totpSchema, type TotpInput } from "@/lib/schemas/auth";

const PRE_AUTH_TOKEN_KEY = "dilivygo-preAuthToken";

export default function TwoFactorPage() {
  const { t } = useTranslation("vendor");
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const { isAuthenticated, isLoading } = useAuthStore();
  const setUser = useAuthStore((s) => s.setUser);

  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);

  const form = useForm<TotpInput>({
    resolver: zodResolver(totpSchema),
    defaultValues: { token: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const token = sessionStorage.getItem(PRE_AUTH_TOKEN_KEY);
    if (!token) {
      toast.error("Two-factor session expired. Please sign in again.");
      router.replace("/login");
      return;
    }
    setPreAuthToken(token);
  }, [router]);

  async function onSubmit(values: TotpInput) {
    if (!preAuthToken) return;

    try {
      const result = await api.auth.login2FA(preAuthToken, values.token);
      setUser(result.user as unknown as User);
      sessionStorage.removeItem(PRE_AUTH_TOKEN_KEY);
      toast.success("Two-factor authentication successful!");
      router.push("/");
    } catch (err: unknown) {
      const tenantKey = tenantHostErrorTranslationKey(err);
      if (tenantKey) {
        toast.error(t(tenantKey));
        // The pre-auth token is bound to the host where step 1 happened.
        // If the user drifted to a different brand, send them back to /login
        // on the *current* host so they can start over correctly.
        sessionStorage.removeItem(PRE_AUTH_TOKEN_KEY);
        router.replace("/login");
        return;
      }
      if (isTenantHostMismatchError(err)) {
        toast.error(t("common:auth.tenantMismatch.generic"));
        sessionStorage.removeItem(PRE_AUTH_TOKEN_KEY);
        router.replace("/login");
        return;
      }
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Invalid two-factor code";
      toast.error(message);
    }
  }

  const loading = form.formState.isSubmitting;
  const watchedToken = form.watch("token");

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-background to-background" />
        <div className="absolute left-1/2 top-0 h-80 w-[800px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-4 py-10"
      >
        <div className="mb-8 flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Store className="size-6" />
          </motion.div>
          <motion.h1
            variants={itemVariants}
            className="mt-4 text-xl font-semibold tracking-tight"
          >
            Two-factor required
          </motion.h1>
          <motion.p
            variants={itemVariants}
            className="mt-1 text-sm text-muted-foreground"
          >
            Enter your 6-digit code to continue.
          </motion.p>
        </div>

        <motion.div variants={itemVariants}>
          <Card className="shadow-lg shadow-black/[0.04] border-border/60">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg font-semibold">Verify code</CardTitle>
              <CardDescription>Use your authenticator app.</CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="totp-token">TOTP code</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="totp-token"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="123456"
                              value={field.value}
                              onChange={(e) =>
                                field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
                              }
                              onBlur={field.onBlur}
                              className="pl-10"
                              required
                              autoFocus
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={loading || watchedToken.length !== 6}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify <ShieldCheck className="size-4" />
                        </>
                      )}
                    </Button>
                  </motion.div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
