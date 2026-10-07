"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "@dilivygo/i18n";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Phone,
  Mail,
  ShoppingBag,
  MessageCircle,
  MapPin,
  ChevronRight,
  Loader2,
  PencilLine,
  Camera,
  Trash2,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  useCustomerProfilePhotoEnabled,
  useDefaultProfilePhotoUrls,
  hasCustomProfilePhoto,
  resolveProfileAvatarUrl,
  useCustomerWalletEnabled,
} from "@dilivygo/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import Link from "next/link";
import { PromoBanner } from "@/components/promo-banner";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/lib/schemas/auth";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : (w[0]! + w[0]!).toUpperCase();
  }
  const a = parts[0]![0] ?? "";
  const b = parts[parts.length - 1]![0] ?? "";
  return (a + b).toUpperCase();
}

type AccountMenuItem = {
  href: string;
  label: string;
  icon: typeof ShoppingBag;
  desc: string;
};

const ACCOUNT_MENU_ITEMS: AccountMenuItem[] = [
  { href: "/orders", label: "My Orders", icon: ShoppingBag, desc: "View your order history" },
  { href: "/addresses", label: "Saved Addresses", icon: MapPin, desc: "Manage delivery addresses" },
  { href: "/chat", label: "Messages & support", icon: MessageCircle, desc: "Orders, restaurants, and platform help" },
];

const MotionLink = motion.create(Link);

export default function AccountPage() {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { customer, isAuthenticated, isLoading, logout } = useAuthStore();
  const setCustomer = useAuthStore((s) => s.setCustomer);
  const clearCart = useCartStore((s) => s.clear);
  const walletEnabled = useCustomerWalletEnabled();
  const accountMenuItems = useMemo(() => {
    const items = [...ACCOUNT_MENU_ITEMS];
    if (walletEnabled) {
      items.splice(1, 0, {
        href: "/wallet",
        label: t("nav.wallet"),
        icon: Wallet,
        desc: t("wallet.subtitle"),
      });
    }
    return items;
  }, [walletEnabled, t]);

  const profilePhotoEnabled = useCustomerProfilePhotoEnabled();
  const defaultProfilePhotoUrls = useDefaultProfilePhotoUrls();
  const [editing, setEditing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CustomerProfileInput>({
    resolver: zodResolver(customerProfileSchema),
    defaultValues: {
      name: customer?.name || "",
      email: customer?.email || "",
    },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleLogout() {
    await logout();
    clearCart();
    router.push("/login");
  }

  useEffect(() => {
    form.reset({
      name: customer?.name || "",
      email: customer?.email || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, customer?.name, customer?.email]);

  const initials = useMemo(
    () => initialsFromName((customer?.name || "").trim() || "Customer"),
    [customer?.name],
  );

  const profileImageSrc = useMemo(
    () =>
      resolveProfileAvatarUrl(customer?.avatarUrl, customer?.id ?? "", defaultProfilePhotoUrls),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls],
  );
  const customProfilePhoto = hasCustomProfilePhoto(customer?.avatarUrl);

  async function onPhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true);
    try {
      const result = await api.auth.uploadCustomerAvatar(file);
      setCustomer(result.customer, result.token);
    } catch {
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoUploading(true);
    try {
      const result = await api.auth.deleteCustomerAvatar();
      setCustomer(result.customer, result.token);
    } catch {
    } finally {
      setPhotoUploading(false);
    }
  }

  async function onSaveProfile(values: CustomerProfileInput) {
    if (values.name === (customer?.name || "") && values.email === (customer?.email || "")) {
      setEditing(false);
      return;
    }

    try {
      const result = await api.auth.updateCustomerProfile({
        name: values.name,
        email: values.email,
      });
      setCustomer(result.customer, result.token);
      setEditing(false);
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to update profile";
      if (statusCode === 409 || message.toLowerCase().includes("already linked")) {
        form.setError("email", { type: "server", message: "This email is already in use." });
        return;
      }
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 lg:px-8">
        <Skeleton className="h-9 w-32 rounded-xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const displayName = customer?.name?.trim() || "Customer";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-2xl px-4 py-8 lg:px-8"
    >
      <PromoBanner placement="account" />

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm">
          <UserCircle2 className="size-5" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">Account</h1>
      </div>

      {/* Profile card */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
        {/* Gradient top strip */}
        <div className="h-20 bg-gradient-to-br from-primary/20 via-primary/8 to-accent/15" />

        <div className="-mt-10 px-6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="relative shrink-0">
              <Avatar className="size-20 border-4 border-card shadow-lg">
                <AvatarImage src={profileImageSrc} alt="" className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
                  {initials || <UserCircle2 className="size-10" />}
                </AvatarFallback>
              </Avatar>
              {profilePhotoEnabled && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={onPhotoFileChange}
                  />
                  <button
                    type="button"
                    disabled={photoUploading}
                    onClick={() => photoInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 disabled:opacity-60"
                    title="Change photo"
                  >
                    {photoUploading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Camera className="size-3.5" />
                    )}
                  </button>
                </>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-2 sm:pt-0">
              <h2 className="truncate text-xl font-extrabold tracking-tight">{displayName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {customer?.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="size-3.5" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer?.email && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="size-3.5" />
                    <span>{customer.email}</span>
                  </div>
                )}
              </div>
            </div>

            {profilePhotoEnabled && customProfilePhoto && !photoUploading && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1.5 text-muted-foreground"
                disabled={photoUploading}
                onClick={() => void handleRemovePhoto()}
              >
                <Trash2 className="size-4" />
                Remove photo
              </Button>
            )}
          </div>

          <div className="mt-5 border-t border-border/50 pt-5">
            <AnimatePresence mode="wait">
              {editing ? (
                <motion.div
                  key="editing"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSaveProfile)} className="space-y-3">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel htmlFor="customer-name" className="text-sm font-semibold">
                              Name
                            </FormLabel>
                            <FormControl>
                              <Input
                                id="customer-name"
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                placeholder="Your name"
                                autoComplete="name"
                                required
                                className="rounded-xl"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field, fieldState }) => (
                          <FormItem className="space-y-1.5">
                            <FormLabel htmlFor="customer-email" className="text-sm font-semibold">
                              Email
                            </FormLabel>
                            <FormControl>
                              <Input
                                id="customer-email"
                                type="email"
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                placeholder="you@example.com"
                                autoComplete="email"
                                className={`rounded-xl ${fieldState.error ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}`}
                                required
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="submit"
                          size="sm"
                          className="gap-2 rounded-xl"
                          disabled={form.formState.isSubmitting}
                        >
                          {form.formState.isSubmitting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save profile"
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => {
                            form.reset({
                              name: customer?.name || "",
                              email: customer?.email || "",
                            });
                            setEditing(false);
                          }}
                          disabled={form.formState.isSubmitting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                </motion.div>
              ) : (
                <motion.div
                  key="not-editing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-xl"
                    onClick={() => setEditing(true)}
                  >
                    <PencilLine className="size-4" />
                    Edit profile
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
        {accountMenuItems.map(({ href, label, icon: Icon, desc }, idx) => (
          <MotionLink
            key={href}
            href={href}
            whileHover={{ backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)", x: 4 }}
            whileTap={{ scale: 0.98 }}
            className={`group flex items-center gap-4 px-5 py-4 transition-colors ${idx < accountMenuItems.length - 1 ? "border-b border-border/50" : ""}`}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 transition-transform group-hover:scale-[1.03]">
              <Icon className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
          </MotionLink>
        ))}
      </div>

      {/* Sign out */}
      <motion.div
        className="mt-6"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </motion.div>
    </motion.div>
  );
}
