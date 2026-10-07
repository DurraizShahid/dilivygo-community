"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Ticket,
  Plus,
  PencilSimple,
  Trash,
  ArrowsClockwise,
  Check,
  Percent,
  CurrencyDollar,
  Truck,
  ShieldSlash,
  CaretRight,
  DotsThreeVertical,
  CalendarBlank,
  User,
  Info,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
  Badge,
  cn,
  formatPrice,
  useCurrency,
  useConfirm,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  Label,
  Switch,
} from "@dilivygo/ui";
import type { PromoCode, PromoCodeType } from "@dilivygo/types";
import { getApiErrorMessage } from "@dilivygo/api";
import { api } from "@/lib/api";
import {
  emptyPromoCodeForm,
  promoCodeSchema,
  type PromoCodeInput,
} from "@/lib/schemas/promo-code";

const TYPE_OPTIONS: {
  value: PromoCodeType;
  label: string;
  icon: typeof Percent;
  description: string;
}[] = [
  { value: "percentage", label: "Percentage Off", icon: Percent, description: "Discount by %" },
  { value: "fixed_amount", label: "Fixed Amount", icon: CurrencyDollar, description: "Flat discount" },
  { value: "free_delivery", label: "Free Delivery", icon: Truck, description: "Waive delivery fee" },
];

function valueLabel(type: PromoCodeType, value: number, currency: string) {
  if (type === "percentage") return `${value}%`;
  if (type === "fixed_amount") return formatPrice(value, currency);
  return "Free";
}

export default function PromoCodesPage() {
  const currency = useCurrency();
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<PromoCodeInput>({
    resolver: zodResolver(promoCodeSchema),
    defaultValues: emptyPromoCodeForm(),
    mode: "onSubmit",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["promo-codes"],
    queryFn: () => api.promoCodes.list(),
  });

  const promoCodes = data?.promoCodes ?? [];
  const promoCodesEnabled =
    (data as { promoCodesEnabled?: boolean } | undefined)?.promoCodesEnabled !== false;

  const createMutation = useMutation({
    mutationFn: (params: Partial<PromoCode> & { code: string; type: string }) =>
      api.promoCodes.create(params),
    onSuccess: () => {
      toast.success("Promo code created");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      closeDialog();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to create")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Partial<PromoCode> }) =>
      api.promoCodes.update(id, params),
    onSuccess: () => {
      toast.success("Promo code updated");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      closeDialog();
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to update")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.promoCodes.delete(id),
    onSuccess: () => {
      toast.success("Promo code deleted");
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to delete")),
  });

  function closeDialog() {
    setIsDialogOpen(false);
    setTimeout(() => {
      form.reset(emptyPromoCodeForm());
      setEditingId(null);
    }, 200);
  }

  function startEdit(pc: PromoCode) {
    form.reset({
      code: pc.code,
      type: pc.type,
      value: pc.value,
      minOrderCents: pc.minOrderCents,
      maxDiscountCents: pc.maxDiscountCents,
      maxUses: pc.maxUses,
      maxUsesPerCustomer: pc.maxUsesPerCustomer,
      startsAt: pc.startsAt ? pc.startsAt.slice(0, 16) : "",
      endsAt: pc.endsAt ? pc.endsAt.slice(0, 16) : "",
      isActive: pc.isActive,
    });
    setEditingId(pc.id);
    setIsDialogOpen(true);
  }

  function openCreate() {
    form.reset(emptyPromoCodeForm());
    setEditingId(null);
    setIsDialogOpen(true);
  }

  function onSubmit(values: PromoCodeInput) {
    const payload = {
      code: values.code.toUpperCase().trim(),
      type: values.type,
      value: values.type === "free_delivery" ? 0 : values.value,
      minOrderCents: values.minOrderCents,
      maxDiscountCents: values.type === "percentage" ? values.maxDiscountCents : null,
      maxUses: values.maxUses,
      maxUsesPerCustomer: values.maxUsesPerCustomer,
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
      isActive: values.isActive,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, params: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const watchedType = form.watch("type");

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
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 lg:px-8">
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
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-8 lg:px-8">
      {confirmDialog}
      
      {/* Header */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">Promo Codes</h1>
            {promoCodesEnabled && (
              <Button onClick={openCreate} className="h-11 gap-2 rounded-xl bg-primary px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <Plus className="size-4" weight="bold" />
                New Code
              </Button>
            )}
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Create and manage discount codes for your customers. Codes can be restricted by order amount, usage limits, and date ranges.
          </p>
        </div>

        {!promoCodesEnabled && (
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-4 rounded-2xl border border-amber-200/50 bg-amber-50/50 p-6 dark:border-amber-800/20 dark:bg-amber-950/20"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <ShieldSlash className="size-5 text-amber-600 dark:text-amber-400" weight="duotone" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Promo codes disabled
              </p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                The platform administrator has disabled promo codes for this workspace.
              </p>
            </div>
          </motion.div>
        )}

        {/* List Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Ticket className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Active Campaigns
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {promoCodes.length === 0 ? (
              <motion.div
                key="empty"
                variants={itemVariants}
                className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/5 py-20 text-center"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/20">
                  <Ticket className="size-8 text-muted-foreground/40" weight="duotone" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">No codes found</h3>
                <p className="mt-1 text-xs text-muted-foreground">Get started by creating your first promo code.</p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                className="space-y-3"
                variants={containerVariants}
              >
                {promoCodes.map((pc) => (
                  <motion.div
                    key={pc.id}
                    variants={itemVariants}
                    layout
                    className="group relative"
                  >
                    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                      <div className="flex flex-col divide-y divide-border/40 sm:flex-row sm:divide-x sm:divide-y-0">
                        <div className="flex flex-1 items-center gap-4 p-5">
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            {pc.type === "percentage" && <Percent className="size-6 text-primary" weight="duotone" />}
                            {pc.type === "fixed_amount" && <CurrencyDollar className="size-6 text-primary" weight="duotone" />}
                            {pc.type === "free_delivery" && <Truck className="size-6 text-primary" weight="duotone" />}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold tracking-wider uppercase text-foreground">
                                {pc.code}
                              </span>
                              {!pc.isActive && (
                                <Badge variant="secondary" className="h-4.5 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                                  Paused
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground/80">
                                {valueLabel(pc.type, pc.value, currency)}
                              </span>
                              <span className="size-1 rounded-full bg-border" />
                              <span>{pc.timesUsed} redemptions</span>
                            </div>
                          </div>
                        </div>

                        <div className="hidden flex-1 items-center gap-6 px-6 sm:flex">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                              Usage Limit
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <User className="size-3 text-muted-foreground/40" />
                              {pc.maxUses ? `${pc.maxUses} total` : "Unlimited"}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                              Expires
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <CalendarBlank className="size-3 text-muted-foreground/40" />
                              {pc.endsAt ? new Date(pc.endsAt).toLocaleDateString() : "Never"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 p-5 sm:w-32">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-full gap-2 rounded-lg border-border/60 hover:bg-muted/50"
                            onClick={() => startEdit(pc)}
                          >
                            <PencilSimple className="size-4" weight="duotone" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 shrink-0 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Delete "${pc.code}"?`,
                                description: "This action cannot be undone.",
                                confirmLabel: "Delete Code",
                                variant: "destructive",
                              });
                              if (ok) deleteMutation.mutate(pc.id);
                            }}
                          >
                            <Trash className="size-4" weight="duotone" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Promo Code" : "Create Promo Code"}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Info className="size-4 text-primary" weight="duotone" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Basic Configuration</span>
                </div>
                
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem className="px-1">
                      <Label>Promo Code</Label>
                      <FormControl>
                        <Input
                          placeholder="e.g. SUMMER2024"
                          {...field}
                          className="h-11 font-mono text-sm font-bold tracking-widest uppercase"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem className="px-1">
                      <Label>Discount Type</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => form.setValue("type", opt.value, { shouldDirty: true })}
                            className={cn(
                              "flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all",
                              field.value === opt.value
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border/60 hover:bg-muted/50"
                            )}
                          >
                            <opt.icon className={cn("size-5", field.value === opt.value ? "text-primary" : "text-muted-foreground")} weight="duotone" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{opt.label.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                <AnimatePresence mode="wait">
                  {watchedType !== "free_delivery" && (
                    <motion.div
                      key="value"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="px-1"
                    >
                      <FormField
                        control={form.control}
                        name="value"
                        render={({ field }) => (
                          <FormItem>
                            <Label>{watchedType === "percentage" ? "Percentage Off (%)" : "Discount Amount"}</Label>
                            <div className="relative">
                              {watchedType === "fixed_amount" && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                  {getCurrencySymbol(currency)}
                                </span>
                              )}
                              <Input
                                type="number"
                                className={cn("h-11", watchedType === "fixed_amount" && "pl-9")}
                                value={watchedType === "fixed_amount" ? (field.value / 100).toFixed(2) : field.value}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  field.onChange(watchedType === "fixed_amount" ? Math.round(val * 100) : val);
                                }}
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Separator className="bg-border/40" />

              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <Info className="size-4 text-primary" weight="duotone" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Usage & Limits</span>
                </div>

                <div className="grid grid-cols-2 gap-4 px-1">
                  <FormField
                    control={form.control}
                    name="minOrderCents"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Min. Order</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(currency)}
                          </span>
                          <Input
                            type="number"
                            className="h-11 pl-9"
                            value={(field.value / 100).toFixed(2)}
                            onChange={(e) => field.onChange(Math.round(Number(e.target.value) * 100))}
                          />
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxUses"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Total Limit</Label>
                        <Input
                          type="number"
                          placeholder="Unlimited"
                          className="h-11"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 px-1">
                  <FormField
                    control={form.control}
                    name="startsAt"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Starts</Label>
                        <Input type="datetime-local" className="h-11" {...field} />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endsAt"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Ends</Label>
                        <Input type="datetime-local" className="h-11" {...field} />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 mx-1">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Campaign active</Label>
                        <p className="text-[10px] text-muted-foreground">Toggle to pause or resume code</p>
                      </div>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
              </div>
            </form>
          </Form>

          <DialogFooter className="border-t border-border/40 pt-4">
            <DialogClose asChild>
              <Button variant="ghost" className="h-11 rounded-xl">Cancel</Button>
            </DialogClose>
            <Button
              className="h-11 rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving}
            >
              {saving ? (
                <ArrowsClockwise className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" weight="bold" />
              )}
              {editingId ? "Update Code" : "Create Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
