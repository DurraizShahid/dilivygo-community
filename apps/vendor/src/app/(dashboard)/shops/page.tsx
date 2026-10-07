"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Storefront,
  Plus,
  PencilSimple,
  MapPin,
  ArrowsClockwise,
  X,
  CheckCircle,
  Funnel,
  Clock,
  Image as ImageIcon,
  Globe,
  Tag,
  Info,
  Hash
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Button,
  Skeleton,
  Badge,
  Input,
  ImageUpload,
  useMapSettings,
  resolveTileUrl,
  resolveAttribution,
  DEFAULT_MAP_SETTINGS,
  Separator,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Switch,
  cn,
  CurrencyPicker,
  useBrowseCategoryPresetsFromTheme,
  Label,
} from "@dilivygo/ui";
import { InternationalPhoneField, isValidPhoneNumber } from "@dilivygo/ui/international-phone-field";
import type { BrowseCategoryPreset, Shop, GeoPolygon, OperatingHours } from "@dilivygo/types";
import { getApiErrorMessage } from "@dilivygo/api";
import { api } from "@/lib/api";
import { GeofenceDrawerMap } from "@/components/map";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type TimeRange = { start: string; end: string };

const DAY_ROWS: Array<{ key: DayKey; label: string }> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function emptyHoursDraft(): Record<DayKey, TimeRange[]> {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

function emptyShopForm() {
  return {
    name: "",
    slug: "",
    description: "",
    address: "",
    phone: "",
    currency: "" as string,
    timezone: "UTC",
    logoUrl: "" as string,
    bannerUrl: "" as string,
    operatingHoursDraft: emptyHoursDraft(),
    lat: null as number | null,
    lon: null as number | null,
    deliveryGeofence: null as GeoPolygon | null,
    browseCategoryIds: [] as string[],
  };
}

type ShopFormState = ReturnType<typeof emptyShopForm>;

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function buildOperatingHoursFromDraft(draft: ShopFormState["operatingHoursDraft"]): OperatingHours {
  const operatingHours: OperatingHours = {};
  for (const day of DAY_ROWS) {
    const rows = draft[day.key];
    const parsed: TimeRange[] = [];
    for (const row of rows) {
      const start = row.start.trim();
      const end = row.end.trim();
      if (!start && !end) continue;
      if (!start || !end || !timeRegex.test(start) || !timeRegex.test(end)) {
        throw new Error(`Invalid ${day.label} hours. Select start/end times.`);
      }
      parsed.push({ start, end });
    }
    if (parsed.length > 0) operatingHours[day.key] = parsed;
  }
  return operatingHours;
}

function shopPayloadFromForm(f: ShopFormState) {
  const operatingHours = buildOperatingHoursFromDraft(f.operatingHoursDraft);
  const logoTrim = f.logoUrl.trim();
  const bannerTrim = f.bannerUrl.trim();
  const phoneTrim = f.phone.trim();
  if (phoneTrim && !isValidPhoneNumber(phoneTrim)) {
    throw new Error("Enter a valid phone number, or leave the field empty.");
  }
  return {
    name: f.name.trim(),
    slug: f.slug.trim() || slugify(f.name),
    description: f.description.trim() || null,
    address: f.address.trim() || null,
    phone: phoneTrim || null,
    currency: f.currency.trim() || null,
    timezone: f.timezone.trim() || "UTC",
    logoUrl: logoTrim ? logoTrim : null,
    bannerUrl: bannerTrim ? bannerTrim : null,
    operatingHours: Object.keys(operatingHours).length > 0 ? operatingHours : null,
    lat: f.lat,
    lon: f.lon,
    deliveryGeofence: f.deliveryGeofence,
    browseCategoryIds: f.browseCategoryIds,
  };
}

function addRange(set: React.Dispatch<React.SetStateAction<ShopFormState>>, day: DayKey) {
  set((f) => ({
    ...f,
    operatingHoursDraft: {
      ...f.operatingHoursDraft,
      [day]: [...f.operatingHoursDraft[day], { start: "", end: "" }],
    },
  }));
}

function updateRange(
  set: React.Dispatch<React.SetStateAction<ShopFormState>>,
  day: DayKey,
  index: number,
  key: keyof TimeRange,
  value: string
) {
  set((f) => ({
    ...f,
    operatingHoursDraft: {
      ...f.operatingHoursDraft,
      [day]: f.operatingHoursDraft[day].map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    },
  }));
}

function removeRange(set: React.Dispatch<React.SetStateAction<ShopFormState>>, day: DayKey, index: number) {
  set((f) => ({
    ...f,
    operatingHoursDraft: {
      ...f.operatingHoursDraft,
      [day]: f.operatingHoursDraft[day].filter((_, i) => i !== index),
    },
  }));
}

function OperatingHoursSection({
  draft,
  setForm,
  disabled,
}: {
  draft: ShopFormState["operatingHoursDraft"];
  setForm: React.Dispatch<React.SetStateAction<ShopFormState>>;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock className="size-4 text-muted-foreground" />
        Operating hours
      </div>
      <p className="text-xs text-muted-foreground">
        Add one or more time ranges per day (24h). Leave a day empty for closed.
      </p>
      <div className="space-y-3">
        {DAY_ROWS.map((day) => (
          <div key={day.key} className="rounded-lg border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{day.label}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => addRange(setForm, day.key)}
              >
                <Plus className="mr-1 size-3.5" />
                Add range
              </Button>
            </div>
            {draft[day.key].length === 0 ? (
              <p className="text-xs text-muted-foreground">Closed</p>
            ) : (
              <div className="space-y-2">
                {draft[day.key].map((row, idx) => (
                  <div key={`${day.key}-${idx}`} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      className="w-[7.5rem]"
                      value={row.start}
                      disabled={disabled}
                      onChange={(e) => updateRange(setForm, day.key, idx, "start", e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      className="w-[7.5rem]"
                      value={row.end}
                      disabled={disabled}
                      onChange={(e) => updateRange(setForm, day.key, idx, "end", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={disabled}
                      onClick={() => removeRange(setForm, day.key, idx)}
                      aria-label={`Remove ${day.label} range`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ShopsPage() {
  const qc = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const ms = useMapSettings();
  const mapSettings = useMemo(() => ({ ...DEFAULT_MAP_SETTINGS, ...ms }), [ms]);
  const mapTileUrl = useMemo(() => resolveTileUrl(mapSettings, isDark), [mapSettings, isDark]);
  const mapTileAttribution = useMemo(
    () => resolveAttribution(mapSettings, isDark),
    [mapSettings, isDark],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyShopForm);
  const [createForm, setCreateForm] = useState(emptyShopForm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMapKey, setCreateMapKey] = useState(0);
  const [editMapKey, setEditMapKey] = useState(0);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<{ shops: Shop[] }>({
    queryKey: ["shops", "all"],
    queryFn: () => api.shops.list({ includeInactive: true }),
  });
  const shops = useMemo(() => data?.shops ?? [], [data?.shops]);

  const browsePresetsFromTheme = useBrowseCategoryPresetsFromTheme();
  const browsePresetsSorted = useMemo(() => {
    const list = browsePresetsFromTheme ?? [];
    return [...list].sort(
      (a, b) =>
        (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.label.localeCompare(b.label),
    );
  }, [browsePresetsFromTheme]);

  const filteredShops = useMemo(() => {
    let list = shops;
    const q = filterSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          (s.address?.toLowerCase().includes(q) ?? false) ||
          (s.phone?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filterStatus === "active") list = list.filter((s) => s.isActive);
    if (filterStatus === "inactive") list = list.filter((s) => !s.isActive);
    return list;
  }, [shops, filterSearch, filterStatus]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("Nothing to update");
      const p = shopPayloadFromForm(form);
      return api.shops.update(editingId, p);
    },
    onSuccess: () => {
      toast.success("Shop updated");
      setIsEditDialogOpen(false);
      setEditingId(null);
      setForm(emptyShopForm());
      setEditMapKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["shops", "all"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to save shop")),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const p = shopPayloadFromForm(createForm);
      return api.shops.create(p);
    },
    onSuccess: () => {
      toast.success("Shop created");
      setCreateDialogOpen(false);
      setCreateForm(emptyShopForm());
      setCreateMapKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["shops", "all"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to create shop")),
  });

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.shops.update(id, { isActive }),
    onMutate: ({ id }) => {
      setTogglingId(id);
    },
    onSuccess: (_, v) => {
      toast.success(v.isActive ? "Shop activated" : "Shop deactivated");
      qc.invalidateQueries({ queryKey: ["shops"] });
      qc.invalidateQueries({ queryKey: ["shops", "all"] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, "Failed to update status")),
    onSettled: () => {
      setTogglingId(null);
    },
  });

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateForm(emptyShopForm());
      setCreateMapKey((k) => k + 1);
    }
  }

  function handleEditDialogOpenChange(open: boolean) {
    setIsEditDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setForm(emptyShopForm());
      setEditMapKey((k) => k + 1);
    }
  }

  function openCreateModal() {
    if (editingId || createDialogOpen) return;
    setCreateForm(emptyShopForm());
    setCreateMapKey((k) => k + 1);
    setCreateDialogOpen(true);
  }

  function startEdit(shop: Shop) {
    setEditingId(shop.id);
    setEditMapKey((k) => k + 1);
    setForm({
      name: shop.name,
      slug: shop.slug,
      description: shop.description ?? "",
      address: shop.address ?? "",
      phone: shop.phone ?? "",
      currency: shop.currency ?? "",
      timezone: shop.timezone ?? "UTC",
      logoUrl: shop.logoUrl ?? "",
      bannerUrl: shop.bannerUrl ?? "",
      operatingHoursDraft: {
        mon: [...(shop.operatingHours?.mon ?? [])],
        tue: [...(shop.operatingHours?.tue ?? [])],
        wed: [...(shop.operatingHours?.wed ?? [])],
        thu: [...(shop.operatingHours?.thu ?? [])],
        fri: [...(shop.operatingHours?.fri ?? [])],
        sat: [...(shop.operatingHours?.sat ?? [])],
        sun: [...(shop.operatingHours?.sun ?? [])],
      },
      lat: shop.lat ?? null,
      lon: shop.lon ?? null,
      deliveryGeofence: shop.deliveryGeofence ?? null,
      browseCategoryIds: [...(shop.browseCategoryIds ?? [])],
    });
    setIsEditDialogOpen(true);
  }

  const renderIdentityFields = (
    f: ShopFormState,
    setF: React.Dispatch<React.SetStateAction<ShopFormState>>,
    opts: { isEdit: boolean; disabled?: boolean; idPrefix: string }
  ) => (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Info className="size-4 text-primary" weight="duotone" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Shop Identity</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${opts.idPrefix}-name`}>Shop Name</Label>
          <Input
            id={`${opts.idPrefix}-name`}
            placeholder="e.g. Downtown Kitchen"
            value={f.name}
            disabled={opts.disabled}
            className="h-11 rounded-xl"
            onChange={(e) => {
              const name = e.target.value;
              setF((prev) => ({
                ...prev,
                name,
                slug: opts.isEdit ? prev.slug : slugify(name),
              }));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${opts.idPrefix}-slug`}>URL Slug</Label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
            <Input
              id={`${opts.idPrefix}-slug`}
              placeholder="downtown-kitchen"
              className="h-11 rounded-xl pl-9 font-mono text-sm"
              value={f.slug}
              disabled={opts.disabled}
              onChange={(e) => setF((prev) => ({ ...prev, slug: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${opts.idPrefix}-tz`}>Timezone</Label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
            <Input
              id={`${opts.idPrefix}-tz`}
              placeholder="Europe/London"
              className="h-11 rounded-xl pl-9"
              value={f.timezone}
              disabled={opts.disabled}
              onChange={(e) => setF((prev) => ({ ...prev, timezone: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Currency</Label>
          <CurrencyPicker
            value={f.currency}
            onChange={(code) => setF((prev) => ({ ...prev, currency: code }))}
            disabled={opts.disabled}
            allowEmpty
            className="max-w-md"
          />
          <p className="text-[10px] text-muted-foreground italic px-1">Leave unset to use workspace default.</p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${opts.idPrefix}-desc`}>Description</Label>
          <Input
            id={`${opts.idPrefix}-desc`}
            placeholder="A short catchphrase for customers"
            value={f.description}
            disabled={opts.disabled}
            className="h-11 rounded-xl"
            onChange={(e) => setF((prev) => ({ ...prev, description: e.target.value }))}
          />
        </div>
      </div>
    </section>
  );

  const renderContactFields = (
    f: ShopFormState,
    setF: React.Dispatch<React.SetStateAction<ShopFormState>>,
    idPrefix: string,
    disabled?: boolean
  ) => (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <MapPin className="size-4 text-primary" weight="duotone" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Contact Details</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-addr`}>Street Address</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
            <Input
              id={`${idPrefix}-addr`}
              placeholder="123 Street, City"
              value={f.address}
              disabled={disabled}
              className="h-11 rounded-xl pl-9"
              onChange={(e) => setF((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-phone`}>Phone Number</Label>
          <InternationalPhoneField
            id={`${idPrefix}-phone`}
            value={f.phone}
            disabled={disabled}
            onChange={(v) => setF((prev) => ({ ...prev, phone: v }))}
          />
        </div>
      </div>
    </section>
  );

  const renderMediaFields = (
    f: ShopFormState,
    setF: React.Dispatch<React.SetStateAction<ShopFormState>>,
    disabled?: boolean
  ) => (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <ImageIcon className="size-4 text-primary" weight="duotone" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Visual Branding</span>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label>Logo Thumbnail</Label>
            <p className="text-[10px] text-muted-foreground italic">Appears in lists and headers.</p>
          </div>
          <ImageUpload
            className="min-h-[140px] rounded-2xl border-border/40 bg-muted/10"
            value={f.logoUrl || null}
            onChange={(url) => setF((prev) => ({ ...prev, logoUrl: url ?? "" }))}
            onUpload={(file) => api.shops.uploadShopImage(file)}
            disabled={disabled}
          />
          <Input
            placeholder="Or paste direct image URL..."
            value={f.logoUrl}
            disabled={disabled}
            onChange={(e) => setF((prev) => ({ ...prev, logoUrl: e.target.value }))}
            className="h-9 rounded-lg font-mono text-[10px]"
          />
        </div>
        <div className="space-y-3">
          <div>
            <Label>Hero Banner</Label>
            <p className="text-[10px] text-muted-foreground italic">Featured wide banner on shop page.</p>
          </div>
          <ImageUpload
            className="min-h-[140px] rounded-2xl border-border/40 bg-muted/10"
            value={f.bannerUrl || null}
            onChange={(url) => setF((prev) => ({ ...prev, bannerUrl: url ?? "" }))}
            onUpload={(file) => api.shops.uploadShopImage(file)}
            disabled={disabled}
          />
          <Input
            placeholder="Or paste direct banner URL..."
            value={f.bannerUrl}
            disabled={disabled}
            onChange={(e) => setF((prev) => ({ ...prev, bannerUrl: e.target.value }))}
            className="h-9 rounded-lg font-mono text-[10px]"
          />
        </div>
      </div>
    </section>
  );

  function renderBrowseCategoriesSection(
    f: ShopFormState,
    setF: React.Dispatch<React.SetStateAction<ShopFormState>>,
    presets: BrowseCategoryPreset[],
    disabled?: boolean,
  ) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Tag className="size-4 text-primary" weight="duotone" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Discovery Tags</span>
        </div>
        {presets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/5 p-6 text-center">
            <p className="text-xs text-muted-foreground italic">No discovery tags configured by administrator.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const on = f.browseCategoryIds.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setF((prev) => ({
                      ...prev,
                      browseCategoryIds: on
                        ? prev.browseCategoryIds.filter((c) => c !== p.code)
                        : [...prev.browseCategoryIds, p.code],
                    }))
                  }
                  className={cn(
                    "rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                    on
                      ? "border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                      : "border-border/60 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  const renderMapSection = (
    f: ShopFormState,
    setF: React.Dispatch<React.SetStateAction<ShopFormState>>,
    mapKey: string
  ) => (
    <section className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Globe className="size-4 text-primary" weight="duotone" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Service Area</span>
      </div>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Place the store pin and draw your delivery polygon using the toolbar. Locations without polygons use system defaults.
      </p>
      <div className="overflow-hidden rounded-2xl border border-border/60 shadow-sm">
        <GeofenceDrawerMap
          key={mapKey}
          lat={f.lat}
          lon={f.lon}
          geofence={f.deliveryGeofence}
          tileUrl={mapTileUrl}
          tileAttribution={mapTileAttribution}
          defaultZoom={mapSettings.defaultZoom}
          showZoomControl={mapSettings.showZoomControls}
          showAttribution={mapSettings.showAttribution}
          polygonStrokeColor={mapSettings.shopMarkerColor}
          onLocationChange={(lat, lon) => setF((prev) => ({ ...prev, lat, lon }))}
          onGeofenceChange={(deliveryGeofence) => setF((prev) => ({ ...prev, deliveryGeofence }))}
        />
      </div>
      {f.lat != null && f.lon != null && (
        <div className="flex items-center gap-2 px-1 text-[10px] font-medium text-muted-foreground/60 tabular-nums">
          <MapPin className="size-3" />
          {f.lat.toFixed(6)}, {f.lon.toFixed(6)}
          <span className="size-1 rounded-full bg-border" />
          {f.deliveryGeofence ? "Custom polygon active" : "Radius fallback"}
        </div>
      )}
    </section>
  );

  const createDisabled = createMutation.isPending || !createForm.name.trim();

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
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-8 lg:px-8">
      {/* Header */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">Shops</h1>
            <Button 
              onClick={openCreateModal} 
              className="h-11 gap-2 rounded-xl bg-primary px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="size-4" weight="bold" />
              Add Shop
            </Button>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Manage your branches, delivery zones, and operating hours across all locations.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Storefront className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Locations</span>
              </div>
              <span className="text-2xl font-bold">{shops.length}</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="size-4 text-green-500" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Active Shops</span>
              </div>
              <span className="text-2xl font-bold">{shops.filter(s => s.isActive).length}</span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-primary" weight="duotone" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Geofenced</span>
              </div>
              <span className="text-2xl font-bold">{shops.filter(s => s.deliveryGeofence).length}</span>
            </div>
          </motion.div>
        </div>

        {/* Filter Section */}
        <div className="space-y-4 px-1">
          <div className="flex items-center gap-2">
            <Funnel className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Filter Locations</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                placeholder="Search name, address, or phone..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="h-11 rounded-xl border-border/60 bg-muted/20"
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                <SelectTrigger className="h-11 rounded-xl border-border/60 bg-muted/20">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Shops List */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Storefront className="size-4 text-primary" weight="duotone" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
              Active Locations
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {shops.length === 0 ? (
              <motion.div
                key="empty"
                variants={itemVariants}
                className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/5 py-20 text-center"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/20">
                  <Storefront className="size-8 text-muted-foreground/40" weight="duotone" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">No shops found</h3>
                <p className="mt-1 text-xs text-muted-foreground">Add your first location to get started.</p>
              </motion.div>
            ) : filteredShops.length === 0 ? (
              <motion.div
                key="no-matches"
                variants={itemVariants}
                className="flex flex-col items-center justify-center rounded-3xl border border-border/60 bg-muted/5 py-12 text-center"
              >
                <Funnel className="size-8 text-muted-foreground/20" />
                <p className="mt-2 text-sm text-muted-foreground">No matches for your search.</p>
                <Button 
                  variant="link" 
                  onClick={() => { setFilterSearch(""); setFilterStatus("all"); }}
                  className="text-xs font-bold uppercase tracking-wider text-primary"
                >
                  Clear Filters
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                className="space-y-3"
                variants={containerVariants}
              >
                {filteredShops.map((shop) => (
                  <motion.div
                    key={shop.id}
                    variants={itemVariants}
                    layout
                    className="group relative"
                  >
                    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                      <div className="flex flex-col divide-y divide-border/40 sm:flex-row sm:divide-x sm:divide-y-0">
                        <div className="flex flex-1 items-center gap-4 p-5">
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            {shop.logoUrl ? (
                              <img src={shop.logoUrl} alt="" className="size-full rounded-xl object-cover" />
                            ) : (
                              <Storefront className="size-6 text-primary" weight="duotone" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold tracking-tight text-foreground">
                                {shop.name}
                              </span>
                              {!shop.isActive && (
                                <Badge variant="secondary" className="h-4.5 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono text-[10px] text-primary/60">/{shop.slug}</span>
                              <span className="size-1 rounded-full bg-border" />
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3" />
                                {shop.address || "No address set"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="hidden flex-1 items-center gap-6 px-6 sm:flex">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                              Zone
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <Globe className={cn("size-3", shop.deliveryGeofence ? "text-primary" : "text-muted-foreground/40")} weight="duotone" />
                              {shop.deliveryGeofence ? "Drawn" : "Radius Only"}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                              Status
                            </span>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={shop.isActive}
                                disabled={togglingId === shop.id}
                                onCheckedChange={(next) => toggleMutation.mutate({ id: shop.id, isActive: next })}
                                className="scale-75"
                              />
                              {togglingId === shop.id && <ArrowsClockwise className="size-3 animate-spin text-muted-foreground" />}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 p-5 sm:w-32">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-full gap-2 rounded-lg border-border/60 hover:bg-muted/50"
                            onClick={() => startEdit(shop)}
                          >
                            <PencilSimple className="size-4" weight="duotone" />
                            Edit
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

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-14 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight">Add Shop</DialogTitle>
            <DialogDescription>
              Create a new branch: set location, delivery zone, categories, and hours.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-8">
              {renderIdentityFields(createForm, setCreateForm, {
                isEdit: false,
                disabled: createMutation.isPending,
                idPrefix: "shop-create",
              })}
              <Separator className="bg-border/40" />
              {renderContactFields(createForm, setCreateForm, "shop-create", createMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderMediaFields(createForm, setCreateForm, createMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderBrowseCategoriesSection(createForm, setCreateForm, browsePresetsSorted, createMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderMapSection(createForm, setCreateForm, `create-${createMapKey}`)}
              <Separator className="bg-border/40" />
              <OperatingHoursSection
                draft={createForm.operatingHoursDraft}
                setForm={setCreateForm}
                disabled={createMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => handleCreateDialogOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              className="h-11 gap-2 rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-lg shadow-primary/20" 
              disabled={createDisabled} 
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <ArrowsClockwise className="size-4 animate-spin" /> : <Plus className="size-4" weight="bold" />}
              Create Shop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,920px)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-14 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight">Edit Shop</DialogTitle>
            <DialogDescription>
              Update settings, images, categories, and delivery map for this branch.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-8">
              {renderIdentityFields(form, setForm, {
                isEdit: true,
                disabled: updateMutation.isPending,
                idPrefix: "shop-edit",
              })}
              <Separator className="bg-border/40" />
              {renderContactFields(form, setForm, "shop-edit", updateMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderMediaFields(form, setForm, updateMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderBrowseCategoriesSection(form, setForm, browsePresetsSorted, updateMutation.isPending)}
              <Separator className="bg-border/40" />
              {renderMapSection(form, setForm, `${editingId}-${editMapKey}`)}
              <Separator className="bg-border/40" />
              <OperatingHoursSection
                draft={form.operatingHoursDraft}
                setForm={setForm}
                disabled={updateMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => handleEditDialogOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              className="h-11 gap-2 rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-lg shadow-primary/20" 
              disabled={updateMutation.isPending || !form.name.trim()} 
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? <ArrowsClockwise className="size-4 animate-spin" /> : <CheckCircle className="size-4" weight="bold" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
