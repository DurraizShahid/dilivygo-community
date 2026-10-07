"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  MapPin,
  Star,
  Pencil,
  Trash2,
  Loader2,
  Check,
  Home,
  Briefcase,
  Building2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Button,
  cn,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  useConfirm,
} from "@dilivygo/ui";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import type { CustomerAddress } from "@dilivygo/types";
import {
  addressFormSchema,
  emptyAddressForm,
  type AddressFormInput,
} from "@/lib/schemas/address";

const LABEL_ICONS: Record<string, typeof Home> = {
  Home: Home,
  Work: Briefcase,
  Office: Building2,
};

const QUICK_LABELS = ["Home", "Work", "Office"];

export default function AddressesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<AddressFormInput>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: emptyAddressForm,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthenticated, authLoading, router]);

  const { data, isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: isAuthenticated,
  });
  const addresses = data?.addresses ?? [];

  const saveMutation = useMutation({
    mutationFn: async (values: AddressFormInput) => {
      const payload = {
        label: values.label || undefined,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || undefined,
        city: values.city || undefined,
        postcode: values.postcode || undefined,
        isDefault: values.isDefault,
      };
      if (editingId) {
        return api.addresses.update(editingId, payload);
      }
      return api.addresses.create(payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
      closeForm();
    },
    onError: () => {},
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.addresses.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: () => {},
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.addresses.setDefault(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  function openNew() {
    setEditingId(null);
    form.reset(emptyAddressForm);
    setShowForm(true);
  }

  function openEdit(addr: CustomerAddress) {
    setEditingId(addr.id);
    form.reset({
      label: addr.label || "",
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      city: addr.city || "",
      postcode: addr.postcode || "",
      isDefault: addr.isDefault,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    form.reset(emptyAddressForm);
  }

  function onSubmit(values: AddressFormInput) {
    saveMutation.mutate(values);
  }

  if (authLoading || !isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto max-w-2xl px-4 py-8 lg:px-8"
    >
      {confirmDialog}
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <motion.button
          onClick={() => router.back()}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground hover:shadow-md"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </motion.button>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Saved Addresses</h1>
          <p className="text-xs text-muted-foreground">
            Manage your delivery addresses
          </p>
        </div>
        {!showForm && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="sm" className="gap-1.5 rounded-xl shadow-sm" onClick={openNew}>
              <Plus className="size-3.5" />
              Add
            </Button>
          </motion.div>
        )}
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm"
          >
            <div className="border-b border-border/50 bg-primary/5 px-6 py-4">
              <h3 className="font-bold tracking-tight">
                {editingId ? "Edit Address" : "New Address"}
              </h3>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem className="mb-4">
                      <FormLabel className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Label
                      </FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_LABELS.map((l) => (
                          <motion.button
                            key={l}
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() =>
                              field.onChange(field.value === l ? "" : l)
                            }
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                              field.value === l
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                            )}
                          >
                            {LABEL_ICONS[l] &&
                              (() => {
                                const Icon = LABEL_ICONS[l];
                                return <Icon className="size-3" />;
                              })()}
                            {l}
                          </motion.button>
                        ))}
                        <FormControl>
                          <Input
                            placeholder="Custom label"
                            value={QUICK_LABELS.includes(field.value) ? "" : field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={field.onBlur}
                            className="h-8 w-32 rounded-full text-xs"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="addressLine1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                          Address line 1
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123 High Street"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            className="rounded-xl"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="addressLine2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                          Address line 2
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Flat 4B (optional)"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            className="rounded-xl"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                            City
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="London"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              className="rounded-xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="postcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                            Postcode
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="SW1A 1AA"
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              className="rounded-xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/50 p-3 transition-colors hover:bg-muted/30">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            className="size-4 rounded border-border accent-primary"
                          />
                          <span className="text-sm font-medium">Set as default address</span>
                        </label>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={closeForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 gap-1.5 rounded-xl shadow-sm"
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {editingId ? "Update" : "Save"}
                  </Button>
                </div>
              </form>
            </Form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Address list */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-6 py-20 text-center shadow-inner dark:bg-muted/15">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary ring-2 ring-primary/15 shadow-sm">
            <MapPin className="size-10" />
          </div>
          <h3 className="mt-6 text-lg font-bold tracking-tight">No saved addresses yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add an address to speed up checkout
          </p>
          <Button
            size="sm"
            className="mt-8 gap-1.5 rounded-xl shadow-sm"
            onClick={openNew}
          >
            <Plus className="size-3.5" />
            Add your first address
          </Button>
        </div>
      ) : (
        <motion.div layout className="space-y-3">
          <AnimatePresence initial={false}>
            {addresses.map((addr) => {
              const LabelIcon =
                LABEL_ICONS[addr.label || ""] ?? MapPin;
              return (
                <motion.div
                  layout
                  key={addr.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="group relative rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
                      <LabelIcon className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold tracking-tight">
                          {addr.label || "Address"}
                        </span>
                        {addr.isDefault && (
                          <Badge
                            variant="secondary"
                            className="gap-1 px-1.5 py-0 text-[10px]"
                          >
                            <Star className="size-2.5 fill-current" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {addr.addressLine1}
                        {addr.addressLine2 ? `, ${addr.addressLine2}` : ""}
                      </p>
                      {(addr.city || addr.postcode) && (
                        <p className="text-xs text-muted-foreground">
                          {[addr.city, addr.postcode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {!addr.isDefault && (
                        <button
                          onClick={() => defaultMutation.mutate(addr.id)}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                          title="Set as default"
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(addr)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Delete this address?",
                            description: "You can add it back later. This will not affect past orders.",
                            confirmLabel: "Delete address",
                            variant: "destructive",
                          });
                          if (ok) deleteMutation.mutate(addr.id);
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                        aria-label="Delete address"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
