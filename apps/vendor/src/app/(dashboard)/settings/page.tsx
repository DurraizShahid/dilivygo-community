"use client";

import { useEffect, useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Storefront, 
  Clock, 
  Truck, 
  Warning, 
  CheckCircle, 
  CloudArrowUp, 
  ForkKnife, 
  Wallet,
  PencilSimple,
  Image as ImageIcon,
  CaretRight,
  Info,
  ArrowsClockwise
} from "@phosphor-icons/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  Input,
  Separator,
  Skeleton,
  cn,
  useCurrency,
  formatPrice,
  WorkspaceLogoImage,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  Label,
} from "@dilivygo/ui";
import type { VendorSettings } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import { getApiErrorMessage } from "@dilivygo/api";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore, staffProjectRef } from "@/stores/workspace-store";
import {
  adminWorkspaceSettingsSchema,
  type AdminWorkspaceSettingsInput,
  vendorSettingsSchema,
  type VendorSettingsInput,
} from "@/lib/schemas/vendor-settings";

function getCurrencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code.toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const VENDOR_SETTINGS_DEFAULTS: VendorSettingsInput = {
  autoAccept: false,
  defaultPrepTimeMinutes: 15,
  deliveryMode: "third_party",
  minimumOrderCents: 0,
  cutleryOffered: false,
  cutleryFeeCents: 0,
};

export default function SettingsPage() {
  const { t } = useTranslation("vendor");
  const queryClient = useQueryClient();
  const currency = useCurrency();
  const activeShop = useShopStore((s) => s.activeShop);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const { workspace, fetchWorkspace } = useWorkspaceStore();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      await api.workspace.uploadLogo(file);
      const ref = staffProjectRef(user) ?? workspace?.projectRef ?? null;
      await fetchWorkspace(ref);
      toast.success("Logo uploaded successfully");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to upload logo";
      toast.error(message);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const { data: settings, isLoading } = useQuery<VendorSettings | null>({
    queryKey: ["vendor-settings", activeShop?.id],
    queryFn: () => api.vendorSettings.get(activeShop?.id),
    enabled: !!activeShop?.id,
  });

  const form = useForm<VendorSettingsInput>({
    resolver: zodResolver(vendorSettingsSchema),
    defaultValues: VENDOR_SETTINGS_DEFAULTS,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!settings) return;
    form.reset({
      autoAccept: settings.autoAccept,
      defaultPrepTimeMinutes: settings.defaultPrepTimeMinutes ?? 15,
      deliveryMode: settings.deliveryMode ?? "third_party",
      minimumOrderCents: settings.minimumOrderCents ?? 0,
      cutleryOffered: settings.cutleryOffered ?? false,
      cutleryFeeCents: settings.cutleryFeeCents ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (values: VendorSettingsInput) =>
      api.vendorSettings.update(values, activeShop?.id),
    onSuccess: (_res, values) => {
      toast.success("Settings saved");
      form.reset(values);
      queryClient.invalidateQueries({
        queryKey: ["vendor-settings", activeShop?.id],
      });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to save settings";
      toast.error(message);
    },
  });

  const onSubmit = (values: VendorSettingsInput) => {
    if (!activeShop?.id) {
      toast.error("Select a shop first");
      return;
    }
    saveMutation.mutate(values);
  };

  const isDirty = form.formState.isDirty;

  const containerVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.25, 1, 0.5, 1] as const,
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: { opacity: 1, y: 0 },
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 lg:px-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-8 lg:px-8">
      {/* Header */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("settings.subtitle")}
          </p>
        </div>

        {/* Identity Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Storefront className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Identity & Profile
            </h2>
          </div>

          <motion.div variants={itemVariants} className="group relative">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
              <div className="flex flex-col divide-y divide-border/40 sm:flex-row sm:divide-x sm:divide-y-0">
                <div className="flex flex-1 items-center gap-4 p-6">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                    {workspace?.logoUrl ? (
                      <WorkspaceLogoImage src={workspace.logoUrl} alt="" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="size-6 text-muted-foreground/40" weight="duotone" />
                      </div>
                    )}
                    {uploadingLogo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                        <ArrowsClockwise className="size-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Store Logo
                    </span>
                    <span className="text-sm font-medium">
                      {workspace?.logoUrl ? "Custom logo active" : "Default icon active"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center p-6 sm:w-32">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 rounded-lg border-border/60"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <CloudArrowUp className="size-4" weight="duotone" />
                    Update
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <StripePayoutsCard />
        </motion.div>

        {/* Fulfillment Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Clock className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Fulfillment & Operations
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Dialog>
              <DialogTrigger asChild>
                <motion.div variants={itemVariants} className="cursor-pointer group">
                  <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          Order Processing
                        </span>
                        <PencilSimple className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className={cn("size-4", form.watch("autoAccept") ? "text-green-500" : "text-muted-foreground/40")} weight="duotone" />
                        <span className="text-sm font-medium">
                          {form.watch("autoAccept") ? "Auto-accept active" : "Manual acceptance"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.watch("defaultPrepTimeMinutes")} min prep time
                      </p>
                    </div>
                  </div>
                </motion.div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Order Processing</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Auto-accept orders</Label>
                      <p className="text-xs text-muted-foreground">Automatically accept new orders</p>
                    </div>
                    <Switch
                      checked={form.watch("autoAccept")}
                      onCheckedChange={(v) => form.setValue("autoAccept", v, { shouldDirty: true })}
                    />
                  </div>
                  <div className="space-y-2 px-1">
                    <Label>Default Prep Time</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        className="h-11 w-24"
                        {...form.register("defaultPrepTimeMinutes", { valueAsNumber: true })}
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" className="h-11 rounded-xl">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <motion.div variants={itemVariants} className="cursor-pointer group">
                  <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          Logistics
                        </span>
                        <PencilSimple className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Truck className="size-4 text-primary" weight="duotone" />
                        <span className="text-sm font-medium">
                          {form.watch("deliveryMode") === "third_party" ? "Platform Riders" : "Own Riders"}
                        </span>
                      </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Logistics & Delivery</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-3">
                    <Label>Delivery Mode</Label>
                    <div className="grid gap-3">
                      {[
                        { value: "third_party", label: "Platform Riders", desc: "Use platform delivery network" },
                        { value: "vendor_rider", label: "Own Riders", desc: "Manage your own delivery team" }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() =>
                            form.setValue("deliveryMode", opt.value as VendorSettingsInput["deliveryMode"], {
                              shouldDirty: true,
                            })
                          }
                          className={cn(
                            "flex flex-col gap-0.5 rounded-xl border p-4 text-left transition-all",
                            form.watch("deliveryMode") === opt.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border/60 hover:bg-muted/50"
                          )}
                        >
                          <span className="text-sm font-semibold">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" className="h-11 rounded-xl">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Commerce Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Wallet className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Commerce & Checkout
            </h2>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <motion.div variants={itemVariants} className="cursor-pointer group">
                <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                      <ForkKnife className="size-5 text-primary" weight="duotone" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">Checkout Options</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          Min. {formatPrice(form.watch("minimumOrderCents"), currency)}
                        </span>
                        <span className="size-1 rounded-full bg-border" />
                        <span>{form.watch("cutleryOffered") ? `Cutlery active (${formatPrice(form.watch("cutleryFeeCents"), currency)})` : "No cutlery fee"}</span>
                      </div>
                    </div>
                  </div>
                  <CaretRight className="size-4 text-muted-foreground/40 group-hover:text-primary" />
                </div>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Checkout Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2 px-1">
                  <Label>Minimum Order Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {getCurrencySymbol(currency)}
                    </span>
                    <Input
                      type="number"
                      step={0.5}
                      className="h-11 pl-10"
                      value={(form.watch("minimumOrderCents") / 100).toFixed(2)}
                      onChange={(e) => {
                        const cents = Math.round(Number(e.target.value) * 100);
                        form.setValue("minimumOrderCents", Math.max(0, cents), { shouldDirty: true });
                      }}
                    />
                  </div>
                </div>

                <Separator className="bg-border/40" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Offer cutlery</Label>
                      <p className="text-xs text-muted-foreground">Allow customers to request cutlery</p>
                    </div>
                    <Switch
                      checked={form.watch("cutleryOffered")}
                      onCheckedChange={(v) => form.setValue("cutleryOffered", v, { shouldDirty: true })}
                    />
                  </div>

                  <AnimatePresence>
                    {form.watch("cutleryOffered") && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2 px-1"
                      >
                        <Label>Cutlery Fee</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(currency)}
                          </span>
                          <Input
                            type="number"
                            step={0.05}
                            className="h-11 pl-10"
                            value={(form.watch("cutleryFeeCents") / 100).toFixed(2)}
                            onChange={(e) => {
                              const cents = Math.round(Number(e.target.value) * 100);
                              form.setValue("cutleryFeeCents", Math.max(0, cents), { shouldDirty: true });
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="h-11 rounded-xl">Close</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isAdmin && (
          <motion.div variants={itemVariants} className="space-y-6 pt-4">
            <Separator className="bg-border/40" />
            <AdminSettingsSection />
          </motion.div>
        )}
      </motion.div>

      {/* Save/Discard Bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-2xl backdrop-blur-xl sm:gap-6 sm:p-3"
          >
            <div className="flex items-center gap-3 pl-3 pr-2 sm:gap-4">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                <Info className="size-4 text-primary" weight="duotone" />
              </div>
              <div className="hidden flex-col sm:flex">
                <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">
                  Unsaved Changes
                </span>
                <span className="text-[10px] text-muted-foreground">
                  You have modified store settings
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 rounded-xl px-4 text-xs font-semibold hover:bg-muted/80"
                onClick={() => form.reset()}
                disabled={saveMutation.isPending}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="h-10 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                onClick={form.handleSubmit(onSubmit)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <ArrowsClockwise className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 size-3.5" weight="bold" />
                )}
                Save Changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StripePayoutsCard() {
  const { workspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["vendor-stripe-connect"],
    queryFn: () => api.vendorStripeConnect.getStatus(),
  });

  const connectMutation = useMutation({
    mutationFn: () => api.vendorStripeConnect.createAccountLink(),
    onSuccess: (res) => {
      if (res?.url) window.location.href = res.url;
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Could not start Stripe onboarding";
      toast.error(message);
    },
  });

  const defaultBps = workspace?.vendorDefaultCommissionBps;
  const defaultPct =
    defaultBps != null && Number.isFinite(defaultBps) ? (defaultBps / 100).toFixed(2) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex flex-col divide-y divide-border/40 sm:flex-row sm:divide-x sm:divide-y-0">
        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" weight="duotone" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Payout Provider
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              <div className="flex items-center gap-1.5">
                <div className={cn("size-1.5 rounded-full", data?.payoutsEnabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-yellow-500")} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  {data?.payoutsEnabled ? "Ready" : "Pending"}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Stripe Connect</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connected account for automated payouts. Platform fee: {defaultPct != null ? `${defaultPct}%` : "Standard"}.
            </p>
          </div>

          {data?.accountId && (
            <div className="rounded-lg bg-muted/20 px-3 py-2">
              <p className="font-mono text-[10px] text-muted-foreground/60 break-all">
                {data.accountId}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 p-6 sm:w-48">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-full gap-2 rounded-lg border-border/60"
            disabled={connectMutation.isPending}
            onClick={() => connectMutation.mutate()}
          >
            {connectMutation.isPending ? (
              <ArrowsClockwise className="size-3.5 animate-spin" />
            ) : (
              <CloudArrowUp className="size-3.5" weight="duotone" />
            )}
            Onboarding
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary"
            disabled={isFetching}
            onClick={() => refetch().then(() => qc.invalidateQueries({ queryKey: ["vendor-stripe-connect"] }))}
          >
            Sync Status
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdminSettingsSection() {
  const { t } = useTranslation("vendor");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.adminSettings.get(),
  });
  const settings = data?.settings;

  const form = useForm<AdminWorkspaceSettingsInput>({
    resolver: zodResolver(adminWorkspaceSettingsSchema),
    defaultValues: {
      avgDeliveryTimeMinutes: 30,
      maxSearchRadiusKm: 15,
    },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!settings) return;
    form.reset({
      avgDeliveryTimeMinutes: settings.avgDeliveryTimeMinutes ?? 30,
      maxSearchRadiusKm: settings.maxSearchRadiusKm ?? 15,
    });
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: (values: AdminWorkspaceSettingsInput) =>
      api.adminSettings.update(values),
    onSuccess: (_res, values) => {
      toast.success("Admin settings saved");
      form.reset(values);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to save")),
  });

  const onSubmit = (values: AdminWorkspaceSettingsInput) => saveMutation.mutate(values);
  const avgDeliveryTimeMinutes = useWatch({ control: form.control, name: "avgDeliveryTimeMinutes" });
  const maxSearchRadiusKm = useWatch({ control: form.control, name: "maxSearchRadiusKm" });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-2xl" />;
  }

  const isDirty = form.formState.isDirty;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Warning className="size-4 text-primary" weight="duotone" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
          Platform Governance
        </h2>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <motion.div whileHover={{ y: -2 }} className="cursor-pointer group">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                  <Info className="size-5 text-primary" weight="duotone" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">System Controls</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{avgDeliveryTimeMinutes}m avg delivery</span>
                    <span className="size-1 rounded-full bg-border" />
                    <span>{maxSearchRadiusKm}km radius</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isDirty && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Unsaved
                  </span>
                )}
                <CaretRight className="size-4 text-muted-foreground/40 group-hover:text-primary" />
              </div>
            </div>
          </motion.div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>System Governance</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2 px-1">
              <Label>Avg. Delivery Time</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  className="h-11 w-24"
                  {...form.register("avgDeliveryTimeMinutes", { valueAsNumber: true })}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
            <div className="space-y-2 px-1">
              <Label>Max Search Radius</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  className="h-11 w-24"
                  {...form.register("maxSearchRadiusKm", { valueAsNumber: true })}
                />
                <span className="text-sm text-muted-foreground">kilometers</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              className="h-11 rounded-xl"
              onClick={() => form.reset()}
              disabled={!isDirty || saveMutation.isPending}
            >
              Discard
            </Button>
            <Button
              className="h-11 rounded-xl bg-primary px-8 font-bold text-primary-foreground"
              onClick={form.handleSubmit(onSubmit)}
              disabled={!isDirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ArrowsClockwise className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 size-4" weight="bold" />
              )}
              Save Governance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
