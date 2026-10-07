"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ForkKnife,
  Plus,
  Trash,
  PencilSimple,
  Check,
  X,
  CheckCircle,
  ArrowsClockwise,
  Funnel,
  Tag,
  CloudArrowUp,
  Barcode,
  Package,
  CaretRight,
  Info,
  WarningCircle,
  Image as ImageIcon,
  Hash,
  SquaresFour,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  PlusCircle,
  DownloadSimple,
  Circle,
  DotsThreeVertical,
  ListBullets,
  ArrowClockwise,
  UploadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  AnimatedTbody,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  EmptyState,
  Badge,
  PriceDisplay,
  Input,
  ImageUpload,
  cn,
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
  useDietaryTagPresetsFromTheme,
  useConfirm,
  Label,
  Switch,
  WorkspaceLogoImage,
} from "@dilivygo/ui";
import {
  DIETARY_TAG_OPTIONS,
  type Product,
  type ProductVariant,
  type Category,
  type ModifierGroup,
  type CustomDietaryTagDefinition,
} from "@dilivygo/types";
import { getApiErrorMessage } from "@dilivygo/api";
import { api } from "@/lib/api";
import {
  downloadMenuCsvTemplate,
  MENU_CSV_MAX_ROWS,
  parseMenuCsv,
  type ParsedMenuProduct,
} from "@/lib/menu-csv";
import { useShopStore } from "@/stores/shop-store";

type ProductDraft = {
  name: string;
  priceCents: string;
  category: string;
  imageUrl: string;
  description: string;
  barcode: string;
  sku: string;
  available: boolean;
  dietaryTags: string[];
};

function emptyProductDraft(): ProductDraft {
  return {
    name: "",
    priceCents: "",
    category: "",
    imageUrl: "",
    description: "",
    barcode: "",
    sku: "",
    available: true,
    dietaryTags: [],
  };
}

/** Sentinel for empty category (unlikely to collide with a real category name). */
const CATEGORY_NONE = "__dilivygo_no_category__";

function slugifyDietaryCode(label: string) {
  const s = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!s) return "";
  const first = /[a-z]/.exec(s);
  if (!first) return `t_${s}`.slice(0, 48);
  const i = first.index;
  return s.slice(i).slice(0, 48);
}

function dietaryTagDisplayLabel(
  code: string,
  custom: CustomDietaryTagDefinition[],
  platformPresets: Array<{ code: string; label: string }>
): string {
  const fromPlatform = platformPresets.find((p) => p.code === code);
  if (fromPlatform) return fromPlatform.label;
  const preset = DIETARY_TAG_OPTIONS.find((o) => o.value === code);
  if (preset) return preset.label;
  const row = custom.find((c) => c.code === code);
  if (row) return row.label;
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ProductFields({
  draft,
  setDraft,
  idPrefix,
  disabled,
  vendorCategories,
  shopDietaryTagOptions,
}: {
  draft: ProductDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>;
  idPrefix: string;
  disabled?: boolean;
  /** Categories created for this shop (from catalog). */
  vendorCategories: Category[];
  /** Built-in presets + this shop’s custom definitions (for toggles). */
  shopDietaryTagOptions: Array<{ value: string; label: string }>;
}) {
  const sortedCatalog = useMemo(
    () => [...vendorCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [vendorCategories]
  );
  const catalogNames = useMemo(() => new Set(sortedCatalog.map((c) => c.name)), [sortedCatalog]);
  const trimmedCategory = draft.category.trim();
  const orphanCategory =
    trimmedCategory && !catalogNames.has(trimmedCategory) ? trimmedCategory : null;
  const selectValue = trimmedCategory ? trimmedCategory : CATEGORY_NONE;

  function toggleDietaryTag(tag: string) {
    setDraft((f) => ({
      ...f,
      dietaryTags: f.dietaryTags.includes(tag)
        ? f.dietaryTags.filter((t) => t !== tag)
        : [...f.dietaryTags, tag],
    }));
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ForkKnife className="size-4 text-primary" weight="duotone" />
        Product details
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm text-primary/80">
        <Barcode className="mt-0.5 size-4 shrink-0" weight="duotone" />
        <span>
          Barcode and SKU are optional. When set, they must be unique within this shop and are used by the POS scanner
          (not shown on the public menu).
        </span>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            placeholder="Product name"
            value={draft.name}
            disabled={disabled}
            onChange={(e) => setDraft((f) => ({ ...f, name: e.target.value }))}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-price`}>Price (minor units, e.g. pence)</Label>
          <Input
            id={`${idPrefix}-price`}
            placeholder="1299"
            inputMode="numeric"
            value={draft.priceCents}
            disabled={disabled}
            onChange={(e) =>
              setDraft((f) => ({
                ...f,
                priceCents: e.target.value.replace(/[^\d]/g, ""),
              }))
            }
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-barcode`}>
            Barcode <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${idPrefix}-barcode`}
            placeholder="e.g. UPC / EAN"
            value={draft.barcode}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => setDraft((f) => ({ ...f, barcode: e.target.value }))}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sku`}>
            SKU <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${idPrefix}-sku`}
            placeholder="Internal code"
            value={draft.sku}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => setDraft((f) => ({ ...f, sku: e.target.value }))}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}-cat`}>
            Category <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Select
            value={selectValue}
            onValueChange={(v) =>
              setDraft((f) => ({ ...f, category: v === CATEGORY_NONE ? "" : v }))
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-cat`} className="w-full rounded-xl">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CATEGORY_NONE}>None</SelectItem>
              {sortedCatalog.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
              {orphanCategory ? (
                <SelectItem value={orphanCategory}>{`${orphanCategory} (not in catalog)`}</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
          {sortedCatalog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No categories yet — add some in the Categories section below, then pick one here.
            </p>
          ) : null}
          {orphanCategory ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              This name is not in your category list. Create a matching category below or choose None and
              reassign.
            </p>
          ) : null}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Image</Label>
          <ImageUpload
            value={draft.imageUrl || null}
            onChange={(url) => setDraft((f) => ({ ...f, imageUrl: url ?? "" }))}
            onUpload={(file) => api.catalog.uploadProductImage(file)}
            disabled={disabled}
            allowUrlInput
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${idPrefix}-desc`}>
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${idPrefix}-desc`}
            placeholder="Shown on the menu"
            value={draft.description}
            disabled={disabled}
            onChange={(e) => setDraft((f) => ({ ...f, description: e.target.value }))}
            className="rounded-xl"
          />
        </div>
        <div className="md:col-span-2 flex items-center gap-3 rounded-xl border border-border/60 p-4">
          <Switch
            id={`${idPrefix}-available`}
            checked={draft.available}
            onCheckedChange={(checked) => setDraft((f) => ({ ...f, available: checked }))}
            disabled={disabled}
          />
          <Label htmlFor={`${idPrefix}-available`} className="cursor-pointer">
            {draft.available ? "Available" : "Unavailable"}
          </Label>
        </div>
        <div className="md:col-span-2 space-y-3">
          <Label>Dietary / allergy tags</Label>
          <p className="text-xs text-muted-foreground">
            Built-in tags plus any you add under &quot;Custom dietary tags&quot; below.
          </p>
          <div className="flex flex-wrap gap-2">
            {shopDietaryTagOptions.map((tag) => {
              const selected = draft.dietaryTags.includes(tag.value);
              return (
                <Button
                  key={tag.value}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  disabled={disabled}
                  onClick={() => toggleDietaryTag(tag.value)}
                  className="rounded-full"
                >
                  {tag.label}
                </Button>
              );
            })}
          </div>
          {draft.dietaryTags.some((t) => !shopDietaryTagOptions.some((o) => o.value === t)) ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              This product still has tag(s) that are not in your current list (e.g. removed custom tag). They remain
              until you clear them; re-add the tag above or toggle them off after saving.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function MenuPage() {
  const activeShop = useShopStore((s) => s.activeShop);
  const themeDietaryPresets = useDietaryTagPresetsFromTheme();
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductDraft>(emptyProductDraft());
  const [createForm, setCreateForm] = useState<ProductDraft>(emptyProductDraft());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFileKey, setBulkFileKey] = useState(0);
  const [bulkItems, setBulkItems] = useState<ParsedMenuProduct[] | null>(null);
  const [bulkParseErrors, setBulkParseErrors] = useState<Array<{ row: number; message: string }> | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all__");

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", required: false, minSelections: "0", maxSelections: "1" });
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: "", required: false, minSelections: "0", maxSelections: "1" });
  const [addingOptionForGroup, setAddingOptionForGroup] = useState<string | null>(null);
  const [optionForm, setOptionForm] = useState({ name: "", priceCents: "0" });
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOptionForm, setEditOptionForm] = useState({ name: "", priceCents: "0" });

  const [addingVariant, setAddingVariant] = useState(false);
  const [variantForm, setVariantForm] = useState({
    name: "",
    priceCents: "",
    sku: "",
    barcode: "",
    imageUrl: "",
    stockQuantity: "",
    available: true,
  });
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editVariantForm, setEditVariantForm] = useState({
    name: "",
    priceCents: "",
    sku: "",
    barcode: "",
    imageUrl: "",
    stockQuantity: "",
    available: true,
  });

  const { data: res, isLoading } = useQuery<{ products: Product[] }>({
    queryKey: ["catalog", "products", activeShop?.id],
    queryFn: () => api.catalog.listProducts(undefined, activeShop?.id),
    enabled: !!activeShop?.id,
  });
  const products = useMemo(() => res?.products ?? [], [res]);

  const editingProduct = editingId ? products.find((p) => p.id === editingId) : null;
  const modifierGroups: ModifierGroup[] = editingProduct?.modifierGroups ?? [];
  const productVariants: ProductVariant[] = editingProduct?.variants ?? [];

  const { data: catRes, isLoading: catsLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ["catalog", "categories", activeShop?.id],
    queryFn: () => api.catalog.listCategories(activeShop?.id),
    enabled: !!activeShop?.id,
  });
  const categories = useMemo(() => {
    const fromCatalog = (catRes?.categories ?? []).map((c) => c.name);
    const fromProducts = products.map((p) => p.category).filter(Boolean) as string[];
    return [...new Set([...fromCatalog, ...fromProducts])].sort();
  }, [catRes?.categories, products]);

  const filteredProducts = useMemo(() => {
    let list = products;
    const q = productSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = p.name.toLowerCase().includes(q);
        const desc = p.description?.toLowerCase().includes(q) ?? false;
        const bc = p.barcode?.toLowerCase().includes(q) ?? false;
        const sk = p.sku?.toLowerCase().includes(q) ?? false;
        return name || desc || bc || sk;
      });
    }
    if (categoryFilter !== "__all__") {
      list = list.filter((p) => (p.category ?? "Uncategorized") === categoryFilter);
    }
    return list;
  }, [products, productSearch, categoryFilter]);

  const displayCategories = useMemo(() => {
    return [...new Set(filteredProducts.map((p) => p.category ?? "Uncategorized"))].sort();
  }, [filteredProducts]);

  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [newCustomDietaryLabel, setNewCustomDietaryLabel] = useState("");
  const [newCustomDietaryCode, setNewCustomDietaryCode] = useState("");

  const { data: vendorSettings } = useQuery({
    queryKey: ["vendor-settings", activeShop?.id],
    queryFn: () => api.vendorSettings.get(activeShop?.id),
    enabled: !!activeShop?.id,
  });

  const mergedPlatformDietaryPresets = useMemo(() => {
    if (themeDietaryPresets?.length) return themeDietaryPresets;
    return DIETARY_TAG_OPTIONS.map((o) => ({ code: o.value, label: o.label }));
  }, [themeDietaryPresets]);

  const reservedPresetCodes = useMemo(
    () => new Set(mergedPlatformDietaryPresets.map((p) => p.code)),
    [mergedPlatformDietaryPresets]
  );

  const shopDietaryTagOptions = useMemo(() => {
    const presets = mergedPlatformDietaryPresets.map((p) => ({ value: p.code, label: p.label }));
    const custom = (vendorSettings?.customDietaryTags ?? [])
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((t) => ({ value: t.code, label: t.label }));
    return [...presets, ...custom];
  }, [mergedPlatformDietaryPresets, vendorSettings?.customDietaryTags]);

  const saveCustomDietaryMutation = useMutation({
    mutationFn: (tags: CustomDietaryTagDefinition[]) =>
      api.vendorSettings.update({ customDietaryTags: tags }, activeShop?.id),
    onSuccess: () => {
      toast.success("Dietary tags saved");
      qc.invalidateQueries({ queryKey: ["vendor-settings", activeShop?.id] });
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Failed to save dietary tags")),
  });

  function addShopCustomDietaryTag() {
    const label = newCustomDietaryLabel.trim();
    if (!label) {
      toast.error("Enter a label (e.g. Sesame-free)");
      return;
    }
    let code =
      newCustomDietaryCode.trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || slugifyDietaryCode(label);
    if (!code) {
      toast.error("Could not derive a code from that label. Enter a code (e.g. sesame_free).");
      return;
    }
    if (!/^[a-z]/.test(code)) {
      code = `t_${code}`;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(code) || code.length > 48) {
      toast.error("Code must start with a letter, use lowercase letters, numbers, and underscores only (max 48).");
      return;
    }
    if (reservedPresetCodes.has(code)) {
      toast.error("That code is reserved for a platform or built-in tag.");
      return;
    }
    const existing = vendorSettings?.customDietaryTags ?? [];
    if (existing.some((t) => t.code === code)) {
      toast.error("A tag with that code already exists.");
      return;
    }
    saveCustomDietaryMutation.mutate([...existing, { code, label }]);
    setNewCustomDietaryLabel("");
    setNewCustomDietaryCode("");
  }

  function removeShopCustomDietaryTag(code: string) {
    const existing = vendorSettings?.customDietaryTags ?? [];
    saveCustomDietaryMutation.mutate(existing.filter((t) => t.code !== code));
  }

  const createProductMutation = useMutation({
    mutationFn: async () =>
      api.catalog.createProduct(
        {
          name: createForm.name.trim(),
          priceCents: Number(createForm.priceCents),
          category: createForm.category.trim() || null,
          imageUrl: createForm.imageUrl.trim() || null,
          description: createForm.description.trim() || null,
          barcode: createForm.barcode.trim() || null,
          sku: createForm.sku.trim() || null,
          available: createForm.available,
          dietaryTags: createForm.dietaryTags,
        },
        activeShop?.id
      ),
    onSuccess: async () => {
      toast.success("Product created");
      setCreateDialogOpen(false);
      setCreateForm(emptyProductDraft());
      await qc.invalidateQueries({ queryKey: ["catalog", "products"] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Failed to create product")),
  });

  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      if (!bulkItems?.length || !activeShop?.id) throw new Error("Nothing to import");
      const items = bulkItems.map((row) => ({
        name: row.name,
        priceCents: row.priceCents,
        category: row.category,
        description: row.description,
        imageUrl: row.imageUrl,
        available: row.available,
        dietaryTags: row.dietaryTags,
        barcode: row.barcode,
        sku: row.sku,
        ...(row.initialVariant
          ? {
              initialVariant: {
                name: row.initialVariant.name,
                priceCents: row.initialVariant.priceCents,
                sku: row.initialVariant.sku,
                barcode: row.initialVariant.barcode,
                stockQuantity: row.initialVariant.stockQuantity,
                available: row.initialVariant.available,
              },
            }
          : {}),
      }));
      return api.catalog.bulkCreateProducts({ items }, activeShop.id);
    },
    onSuccess: async (data) => {
      const parts: string[] = [`Imported ${data.created} product(s).`];
      const vc = data.variantsCreated ?? 0;
      if (vc > 0) {
        parts.push(`${vc} initial variant${vc === 1 ? "" : "s"} created from CSV.`);
      }
      if (data.categoriesCreated > 0) {
        parts.push(
          `${data.categoriesCreated} new categor${data.categoriesCreated === 1 ? "y" : "ies"}.`
        );
      }
      if (data.dietaryTagsCreated > 0) {
        parts.push(
          `${data.dietaryTagsCreated} new dietary tag${data.dietaryTagsCreated === 1 ? "" : "s"}.`
        );
      }
      toast.success(parts.join(" "));
      setBulkDialogOpen(false);
      setBulkItems(null);
      setBulkParseErrors(null);
      setBulkFileKey((k) => k + 1);
      await qc.invalidateQueries({ queryKey: ["catalog", "products"] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
      await qc.invalidateQueries({ queryKey: ["vendor-settings", activeShop?.id] });
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, "Import failed");
      const details = (err as { body?: { details?: unknown } } | null)?.body?.details;
      if (Array.isArray(details) && details.length) {
        const bit = details
          .slice(0, 4)
          .map((d: { field?: string; message?: string }) => d.message || d.field)
          .join("; ");
        toast.error(`${msg}${bit ? ` — ${bit}` : ""}`);
      } else {
        toast.error(msg);
      }
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No product selected");
      return api.catalog.updateProduct(
        editingId,
        {
          name: form.name.trim(),
          priceCents: Number(form.priceCents),
          category: form.category.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          description: form.description.trim() || null,
          barcode: form.barcode.trim() || null,
          sku: form.sku.trim() || null,
          available: form.available,
          dietaryTags: form.dietaryTags,
        },
        activeShop?.id
      );
    },
    onSuccess: async () => {
      toast.success("Product updated");
      setEditingId(null);
      setForm(emptyProductDraft());
      resetModifierState();
      await qc.invalidateQueries({ queryKey: ["catalog", "products"] });
      await qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
    },
    onError: (err: unknown) =>
      toast.error(getApiErrorMessage(err, "Failed to save product")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      api.catalog.updateProduct(id, { available }, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.catalog.deleteProduct(id, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => api.catalog.createCategory({ name }, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "categories", activeShop?.id] }),
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.catalog.updateCategory(id, { name }, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "categories", activeShop?.id] }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.catalog.deleteCategory(id, activeShop?.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["catalog", "categories", activeShop?.id] });
      await qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
  });

  function resetVariantState() {
    setAddingVariant(false);
    setVariantForm({
      name: "",
      priceCents: "",
      sku: "",
      barcode: "",
      imageUrl: "",
      stockQuantity: "",
      available: true,
    });
    setEditingVariantId(null);
    setEditVariantForm({
      name: "",
      priceCents: "",
      sku: "",
      barcode: "",
      imageUrl: "",
      stockQuantity: "",
      available: true,
    });
  }

  function resetModifierState() {
    setAddingGroup(false);
    setGroupForm({ name: "", required: false, minSelections: "0", maxSelections: "1" });
    setEditingGroupId(null);
    setEditGroupForm({ name: "", required: false, minSelections: "0", maxSelections: "1" });
    setAddingOptionForGroup(null);
    setOptionForm({ name: "", priceCents: "0" });
    setEditingOptionId(null);
    setEditOptionForm({ name: "", priceCents: "0" });
    resetVariantState();
  }

  const createGroupMutation = useMutation({
    mutationFn: (params: { name: string; required?: boolean; minSelections?: number; maxSelections?: number }) =>
      api.catalog.createModifierGroup(editingId!, params, activeShop?.id),
    onSuccess: () => {
      setAddingGroup(false);
      setGroupForm({ name: "", required: false, minSelections: "0", maxSelections: "1" });
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({
      groupId,
      params,
    }: {
      groupId: string;
      params: Partial<{ name: string; required: boolean; minSelections: number; maxSelections: number }>;
    }) => api.catalog.updateModifierGroup(groupId, params, activeShop?.id),
    onSuccess: () => {
      setEditingGroupId(null);
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.catalog.deleteModifierGroup(groupId, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] }),
  });

  const createOptionMutation = useMutation({
    mutationFn: ({ groupId, params }: { groupId: string; params: { name: string; priceCents?: number } }) =>
      api.catalog.createModifierOption(groupId, params, activeShop?.id),
    onSuccess: () => {
      setAddingOptionForGroup(null);
      setOptionForm({ name: "", priceCents: "0" });
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: ({
      optionId,
      params,
    }: {
      optionId: string;
      params: Partial<{ name: string; priceCents: number }>;
    }) => api.catalog.updateModifierOption(optionId, params, activeShop?.id),
    onSuccess: () => {
      setEditingOptionId(null);
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (optionId: string) => api.catalog.deleteModifierOption(optionId, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] }),
  });

  const createVariantMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No product selected");
      const pc = Number(variantForm.priceCents);
      if (!variantForm.name.trim() || !Number.isFinite(pc) || pc < 0) {
        throw new Error("Variant name and valid price are required");
      }
      const stockRaw = variantForm.stockQuantity.trim();
      return api.catalog.createProductVariant(
        editingId,
        {
          name: variantForm.name.trim(),
          priceCents: Math.floor(pc),
          sku: variantForm.sku.trim() || null,
          barcode: variantForm.barcode.trim() || null,
          imageUrl: variantForm.imageUrl.trim() || null,
          available: variantForm.available,
          stockQuantity: stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw))),
        },
        activeShop?.id
      );
    },
    onSuccess: () => {
      setAddingVariant(false);
      setVariantForm({
        name: "",
        priceCents: "",
        sku: "",
        barcode: "",
        imageUrl: "",
        stockQuantity: "",
        available: true,
      });
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
    onError: (err: { body?: { error?: string }; message?: string }) =>
      toast.error(err?.body?.error || err?.message || "Failed to add variant"),
  });

  const updateVariantMutation = useMutation({
    mutationFn: async () => {
      if (!editingVariantId) throw new Error("No variant");
      const pc = Number(editVariantForm.priceCents);
      if (!editVariantForm.name.trim() || !Number.isFinite(pc) || pc < 0) {
        throw new Error("Variant name and valid price are required");
      }
      const stockRaw = editVariantForm.stockQuantity.trim();
      return api.catalog.updateProductVariant(
        editingVariantId,
        {
          name: editVariantForm.name.trim(),
          priceCents: Math.floor(pc),
          sku: editVariantForm.sku.trim() || null,
          barcode: editVariantForm.barcode.trim() || null,
          imageUrl: editVariantForm.imageUrl.trim() || null,
          available: editVariantForm.available,
          stockQuantity: stockRaw === "" ? null : Math.max(0, Math.floor(Number(stockRaw))),
        },
        activeShop?.id
      );
    },
    onSuccess: () => {
      setEditingVariantId(null);
      qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] });
    },
    onError: (err: { body?: { error?: string }; message?: string }) =>
      toast.error(err?.body?.error || err?.message || "Failed to update variant"),
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (variantId: string) => api.catalog.deleteProductVariant(variantId, activeShop?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "products", activeShop?.id] }),
    onError: (err: { body?: { error?: string }; message?: string }) =>
      toast.error(err?.body?.error || err?.message || "Failed to delete variant"),
  });

  function startEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name ?? "",
      priceCents: String(product.priceCents ?? ""),
      category: product.category ?? "",
      imageUrl: product.imageUrl ?? "",
      description: product.description ?? "",
      barcode: product.barcode ?? "",
      sku: product.sku ?? "",
      available: product.available ?? true,
      dietaryTags: product.dietaryTags ?? [],
    });
    resetModifierState();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyProductDraft());
    resetModifierState();
  }

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) setCreateForm(emptyProductDraft());
  }

  function handleBulkDialogOpenChange(open: boolean) {
    setBulkDialogOpen(open);
    if (!open) {
      setBulkItems(null);
      setBulkParseErrors(null);
      setBulkFileKey((k) => k + 1);
    }
  }

  function openBulkUploadModal() {
    if (editingId || createDialogOpen || bulkDialogOpen) return;
    setBulkItems(null);
    setBulkParseErrors(null);
    setBulkFileKey((k) => k + 1);
    setBulkDialogOpen(true);
  }

  function openCreateProductModal() {
    if (editingId || createDialogOpen || bulkDialogOpen) return;
    setCreateForm(emptyProductDraft());
    setCreateDialogOpen(true);
  }

  function onBulkFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const res = parseMenuCsv(text);
      if (!res.ok) {
        setBulkParseErrors(res.errors);
        setBulkItems(null);
        return;
      }
      setBulkParseErrors(null);
      setBulkItems(res.items);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  const saveDisabled =
    updateProductMutation.isPending ||
    !form.name.trim() ||
    !form.priceCents ||
    Number.isNaN(Number(form.priceCents));

  const createDisabled =
    createProductMutation.isPending ||
    !createForm.name.trim() ||
    !createForm.priceCents ||
    Number.isNaN(Number(createForm.priceCents));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 400, damping: 30 },
    },
  };

  const metrics = useMemo(() => {
    return [
      {
        label: "Total Products",
        value: products.length,
        icon: Package,
        color: "text-primary",
      },
      {
        label: "Categories",
        value: categories.length,
        icon: ListBullets,
        color: "text-blue-500",
      },
      {
        label: "Available Items",
        value: products.filter((p) => p.available).length,
        icon: CheckCircle,
        color: "text-emerald-500",
      },
    ];
  }, [products, categories]);

  if (!activeShop?.id) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        <motion.div variants={itemVariants}>
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your products and pricing</p>
        </motion.div>
        <motion.div variants={itemVariants}>
          <EmptyState
            icon={<ForkKnife weight="duotone" />}
            title="Select a shop"
            description="Choose a shop in the header to view and edit its menu."
          />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-10"
    >
      {confirmDialog}
      
      {/* Header & Metrics */}
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <motion.div variants={itemVariants}>
            <h1 className="text-3xl font-bold tracking-tight">Menu</h1>
            <p className="text-muted-foreground">
              Manage products and pricing for <span className="font-medium text-foreground">{activeShop.name}</span>
            </p>
          </motion.div>
          <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={openBulkUploadModal}
              className="h-11 rounded-xl px-5 transition-all hover:bg-muted"
            >
              <UploadSimple className="mr-2 size-4" weight="duotone" />
              Bulk upload
            </Button>
            <Button
              onClick={openCreateProductModal}
              className="h-11 rounded-xl px-6 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <PlusCircle className="mr-2 size-5" weight="duotone" />
              Add product
            </Button>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              variants={itemVariants}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 transition-all hover:border-primary/20 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className={cn("rounded-xl bg-muted/50 p-3 transition-colors group-hover:bg-primary/10", metric.color)}>
                  <metric.icon className="size-6" weight="duotone" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold tabular-nums tracking-tight">
                    {metric.value}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
      </AnimatePresence>

      <Dialog open={!!editingId} onOpenChange={(open) => !open && cancelEdit()}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-5 pr-14 text-left">
            <div className="flex items-center gap-2">
              <PencilSimple className="size-5 text-primary" weight="duotone" />
              <DialogTitle className="text-xl font-bold tracking-tight">Edit product</DialogTitle>
            </div>
            <DialogDescription>
              Update details for {editingProduct?.name}. Changes apply immediately to the public menu.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <div className="space-y-10">
              <ProductFields
                draft={form}
                setDraft={setForm}
                idPrefix="menu-edit"
                disabled={updateProductMutation.isPending}
                vendorCategories={catRes?.categories ?? []}
                shopDietaryTagOptions={shopDietaryTagOptions}
              />

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <SquaresFour className="size-5 text-primary" weight="duotone" />
                    <h3 className="text-base font-semibold">Variants</h3>
                  </div>
                  {!addingVariant && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingVariant(true)}
                      className="h-8 rounded-lg px-3"
                      disabled={updateProductMutation.isPending}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Add variant
                    </Button>
                  )}
                </div>
                
                <div className="grid gap-3">
                  <AnimatePresence mode="popLayout">
                    {addingVariant && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4"
                      >
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Name</Label>
                            <Input
                              value={variantForm.name}
                              onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))}
                              placeholder="e.g. Large"
                              className="h-9 rounded-lg"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Price (minor units)</Label>
                            <Input
                              inputMode="numeric"
                              value={variantForm.priceCents}
                              onChange={(e) =>
                                setVariantForm((f) => ({ ...f, priceCents: e.target.value.replace(/[^\d]/g, "") }))
                              }
                              placeholder="1299"
                              className="h-9 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => createVariantMutation.mutate()}
                            disabled={createVariantMutation.isPending || !variantForm.name.trim() || !variantForm.priceCents.trim()}
                            className="rounded-lg px-4"
                          >
                            Save variant
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setAddingVariant(false)} className="rounded-lg">
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    )}
                    
                    {productVariants.map((v) => (
                      <motion.div
                        key={v.id}
                        layout
                        className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/5 p-3 transition-colors hover:border-primary/20"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{v.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <PriceDisplay cents={v.priceCents} /> · {v.available ? "Available" : "Unavailable"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditingVariantId(v.id);
                              setEditVariantForm({
                                name: v.name,
                                priceCents: String(v.priceCents),
                                sku: v.sku ?? "",
                                barcode: v.barcode ?? "",
                                imageUrl: v.imageUrl ?? "",
                                stockQuantity: v.stockQuantity != null ? String(v.stockQuantity) : "",
                                available: v.available,
                              });
                            }}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <PencilSimple className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete variant?",
                                description: "This cannot be undone.",
                                confirmLabel: "Delete",
                                variant: "destructive",
                              });
                              if (ok) deleteVariantMutation.mutate(v.id);
                            }}
                          >
                            <Trash className="size-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <ListBullets className="size-5 text-primary" weight="duotone" />
                    <h3 className="text-base font-semibold">Modifier Groups</h3>
                  </div>
                  {!addingGroup && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingGroup(true)}
                      className="h-8 rounded-lg px-3"
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Add group
                    </Button>
                  )}
                </div>

                <div className="grid gap-4">
                  {modifierGroups.map((group) => (
                    <div key={group.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                      <div className="flex items-center justify-between gap-4 bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">{group.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {group.required ? "Required" : "Optional"} · {group.minSelections}–{group.maxSelections} selections
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteGroupMutation.mutate(group.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="divide-y divide-border/40 px-4">
                        {group.options.map((opt) => (
                          <div key={opt.id} className="flex items-center justify-between py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{opt.name}</span>
                              {opt.priceCents > 0 && (
                                <span className="text-xs text-muted-foreground">+<PriceDisplay cents={opt.priceCents} /></span>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteOptionMutation.mutate(opt.id)}
                              className="size-7 text-muted-foreground/40 hover:text-destructive"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="py-2.5">
                          {addingOptionForGroup === group.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={optionForm.name}
                                onChange={(e) => setOptionForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="Option name"
                                className="h-8 rounded-lg text-xs"
                              />
                              <Input
                                value={optionForm.priceCents}
                                onChange={(e) => setOptionForm((f) => ({ ...f, priceCents: e.target.value.replace(/[^\d]/g, "") }))}
                                placeholder="Pence"
                                className="h-8 w-20 rounded-lg text-xs"
                              />
                              <Button
                                size="sm"
                                onClick={() => createOptionMutation.mutate({ groupId: group.id, params: { name: optionForm.name.trim(), priceCents: Number(optionForm.priceCents) } })}
                                className="h-8 rounded-lg"
                              >
                                <Check className="size-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAddingOptionForGroup(group.id)}
                              className="h-8 w-full justify-start rounded-lg text-xs text-muted-foreground hover:bg-muted/50"
                            >
                              <Plus className="mr-2 size-3.5" />
                              Add option
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {addingGroup && (
                    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-4">
                      <Input
                        value={groupForm.name}
                        onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Group name (e.g. Extras)"
                        className="rounded-xl"
                      />
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={groupForm.required}
                            onCheckedChange={(v) => setGroupForm((f) => ({ ...f, required: v }))}
                          />
                          <Label className="text-xs">Required</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Max selections</Label>
                          <Input
                            value={groupForm.maxSelections}
                            onChange={(e) => setGroupForm((f) => ({ ...f, maxSelections: e.target.value }))}
                            className="h-8 w-16 rounded-lg text-center"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => createGroupMutation.mutate({ name: groupForm.name.trim(), required: groupForm.required, maxSelections: Number(groupForm.maxSelections) })}
                          className="rounded-lg"
                        >
                          Add group
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAddingGroup(false)} className="rounded-lg">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-3 border-t border-border/60 bg-muted/20 px-6 py-5 sm:justify-end">
            <Button
              variant="outline"
              onClick={cancelEdit}
              disabled={updateProductMutation.isPending}
              className="h-11 rounded-xl px-6"
            >
              Cancel
            </Button>
            <Button
              className="h-11 rounded-xl px-8 shadow-lg shadow-primary/20"
              disabled={saveDisabled}
              onClick={() => updateProductMutation.mutate()}
            >
              {updateProductMutation.isPending ? (
                <ArrowClockwise className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 size-5" weight="duotone" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-5 pr-14 text-left">
            <div className="flex items-center gap-2">
              <PlusCircle className="size-5 text-primary" weight="duotone" />
              <DialogTitle className="text-xl font-bold tracking-tight">Add product</DialogTitle>
            </div>
            <DialogDescription>
              Create a new menu item for {activeShop.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <ProductFields
              draft={createForm}
              setDraft={setCreateForm}
              idPrefix="menu-create"
              disabled={createProductMutation.isPending}
              vendorCategories={catRes?.categories ?? []}
              shopDietaryTagOptions={shopDietaryTagOptions}
            />
          </div>
          <DialogFooter className="shrink-0 gap-3 border-t border-border/60 bg-muted/20 px-6 py-5 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => handleCreateDialogOpenChange(false)}
              disabled={createProductMutation.isPending}
              className="h-11 rounded-xl px-6"
            >
              Cancel
            </Button>
            <Button
              className="h-11 rounded-xl px-8 shadow-lg shadow-primary/20"
              disabled={createDisabled}
              onClick={() => createProductMutation.mutate()}
            >
              {createProductMutation.isPending ? (
                <ArrowClockwise className="mr-2 size-4 animate-spin" />
              ) : (
                <PlusCircle className="mr-2 size-5" weight="duotone" />
              )}
              Create product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
        <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-5 pr-14 text-left">
            <div className="flex items-center gap-2">
              <CloudArrowUp className="size-5 text-primary" weight="duotone" />
              <DialogTitle className="text-xl font-bold tracking-tight">Bulk upload menu</DialogTitle>
            </div>
            <DialogDescription>
              Upload a CSV for {activeShop.name}. Up to {MENU_CSV_MAX_ROWS} rows per file.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-6">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/10 bg-primary/5 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-primary">Need a template?</p>
                <p className="text-xs text-primary/70">Download our pre-formatted CSV to get started.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadMenuCsvTemplate()} className="h-9 rounded-lg bg-background px-4">
                <DownloadSimple className="mr-2 size-4" />
                Download template
              </Button>
            </div>
            <div className="space-y-3">
              <Label htmlFor="menu-bulk-csv">CSV file</Label>
              <Input
                key={bulkFileKey}
                id="menu-bulk-csv"
                type="file"
                accept=".csv,text/csv"
                className="h-11 cursor-pointer rounded-xl pt-2"
                onChange={onBulkFileSelected}
              />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Required columns: <span className="font-bold text-foreground">name</span>, <span className="font-bold text-foreground">price_cents</span>. 
                Optional: category, description, available, image_url, dietary_tags.
              </p>
            </div>
            {bulkParseErrors && bulkParseErrors.length > 0 ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <WarningCircle className="size-4" />
                  Fix these rows and re-upload:
                </div>
                <ul className="list-inside list-disc space-y-1 text-xs opacity-80">
                  {bulkParseErrors.map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {bulkItems && (!bulkParseErrors || bulkParseErrors.length === 0) ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="size-4 text-emerald-500" weight="duotone" />
                  Ready to import <span className="font-bold text-foreground">{bulkItems.length}</span> products.
                </div>
                <div className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-muted/5">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground/60">Name</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground/60">Price</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground/60">Category</th>
                      </tr>
                    </thead>
                    <AnimatedTbody>
                      {bulkItems.slice(0, 15).map((row, idx) => (
                        <tr key={idx} className="border-t border-border/40 transition-colors hover:bg-muted/10">
                          <td className="px-3 py-2 font-medium">{row.name}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <PriceDisplay cents={row.priceCents} />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.category ?? "—"}</td>
                        </tr>
                      ))}
                    </AnimatedTbody>
                  </table>
                </div>
                {bulkItems.length > 15 && (
                  <p className="text-[10px] text-center text-muted-foreground italic">Showing first 15 of {bulkItems.length} rows.</p>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 gap-3 border-t border-border/60 bg-muted/20 px-6 py-5 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => handleBulkDialogOpenChange(false)}
              disabled={bulkImportMutation.isPending}
              className="h-11 rounded-xl px-6"
            >
              Cancel
            </Button>
            <Button
              className="h-11 rounded-xl px-8 shadow-lg shadow-primary/20"
              disabled={
                !bulkItems?.length ||
                bulkImportMutation.isPending ||
                (bulkParseErrors != null && bulkParseErrors.length > 0)
              }
              onClick={() => bulkImportMutation.mutate()}
            >
              {bulkImportMutation.isPending ? (
                <ArrowClockwise className="mr-2 size-4 animate-spin" />
              ) : (
                <CloudArrowUp className="mr-2 size-5" weight="duotone" />
              )}
              Import products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <motion.div variants={itemVariants} className="rounded-2xl border border-border/60 bg-muted/5 p-6">
        <div className="mb-6 flex items-center gap-2">
          <Funnel className="size-5 text-primary" weight="duotone" />
          <h2 className="text-sm font-semibold">Filter menu</h2>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, description, SKU or barcode…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="h-11 rounded-xl pl-10"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-[240px]">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Category
            </Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="group overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:border-primary/20">
          <div className="border-b border-border/60 bg-muted/5 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Tag className="size-5 text-primary" weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Custom dietary & allergy tags</h3>
                <p className="text-sm text-muted-foreground">Add labels your kitchen uses (e.g. dairy-free, sesame-free).</p>
              </div>
            </div>
          </div>
          <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="custom-dietary-label">Label (shown to customers)</Label>
                <Input
                  id="custom-dietary-label"
                  placeholder="e.g. Sesame-free"
                  value={newCustomDietaryLabel}
                  onChange={(e) => setNewCustomDietaryLabel(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="w-full min-w-0 flex-1 space-y-2 sm:max-w-[220px]">
                <Label htmlFor="custom-dietary-code">Code (optional)</Label>
                <Input
                  id="custom-dietary-code"
                  placeholder="sesame_free"
                  className="rounded-xl font-mono text-sm"
                  value={newCustomDietaryCode}
                  onChange={(e) => setNewCustomDietaryCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                />
              </div>
              <Button
                type="button"
                className="h-10 rounded-xl px-6"
                onClick={addShopCustomDietaryTag}
                disabled={saveCustomDietaryMutation.isPending || !newCustomDietaryLabel.trim()}
              >
                {saveCustomDietaryMutation.isPending ? (
                  <ArrowClockwise className="size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                Add tag
              </Button>
            </div>
            
            <AnimatePresence mode="wait">
              {(vendorSettings?.customDietaryTags?.length ?? 0) === 0 ? (
                <motion.div
                  key="no-tags"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Info className="size-4" />
                  No custom tags yet. Built-in tags are always available.
                </motion.div>
              ) : (
                <motion.div
                  key="tags-list"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-wrap gap-2"
                >
                  {(vendorSettings?.customDietaryTags ?? [])
                    .slice()
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map((t) => (
                      <motion.div
                        key={t.code}
                        variants={itemVariants}
                        layout
                        className="group flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-4 py-1.5 transition-all hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span className="text-sm font-medium">{t.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/60">{t.code}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground/40 hover:text-destructive"
                          aria-label={`Remove ${t.label}`}
                          disabled={saveCustomDietaryMutation.isPending}
                          onClick={() => removeShopCustomDietaryTag(t.code)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </motion.div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="group overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:border-primary/20">
          <div className="border-b border-border/60 bg-muted/5 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <SquaresFour className="size-5 text-primary" weight="duotone" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Categories</h3>
                <p className="text-sm text-muted-foreground">Organize your menu; products can reference these names.</p>
              </div>
            </div>
          </div>
          <div className="space-y-6 p-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="New category name (e.g. Desserts)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="h-10 rounded-xl"
              />
              <Button
                className="h-10 rounded-xl px-6"
                onClick={() => {
                  const name = newCategory.trim();
                  if (!name) return;
                  createCategoryMutation.mutate(name);
                  setNewCategory("");
                }}
                disabled={createCategoryMutation.isPending || !newCategory.trim()}
              >
                {createCategoryMutation.isPending ? (
                  <ArrowClockwise className="size-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 size-4" />
                )}
                Add category
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {catsLoading ? (
                <motion.div
                  key="cats-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </motion.div>
              ) : (catRes?.categories?.length ?? 0) === 0 ? (
                <motion.div
                  key="no-cats"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground"
                >
                  No categories yet.
                </motion.div>
              ) : (
                <motion.div
                  key="cats-list"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {catRes!.categories.map((c) => (
                    <motion.div
                      key={c.id}
                      variants={itemVariants}
                      layout
                      className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/5 p-2 transition-all hover:border-primary/20"
                    >
                      <Input
                        value={renaming[c.id] ?? c.name}
                        onChange={(e) => setRenaming((r) => ({ ...r, [c.id]: e.target.value }))}
                        className="h-9 border-none bg-transparent focus-visible:ring-0"
                      />
                      <div className="flex items-center gap-1 pr-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            renameCategoryMutation.mutate({
                              id: c.id,
                              name: (renaming[c.id] ?? c.name).trim(),
                            })
                          }
                          disabled={renameCategoryMutation.isPending}
                          className="text-primary hover:bg-primary/10"
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteCategoryMutation.mutate(c.id)}
                          disabled={deleteCategoryMutation.isPending}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash className="size-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="products-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </motion.div>
        ) : products.length === 0 ? (
          <motion.div
            key="no-products"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <EmptyState
              icon={<ForkKnife weight="duotone" />}
              title="No products yet"
              description="Add dishes and drinks to this shop’s menu"
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={openCreateProductModal}
                    className="h-11 rounded-xl px-6"
                  >
                    <PlusCircle className="mr-2 size-5" weight="duotone" />
                    Add product
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openBulkUploadModal}
                    className="h-11 rounded-xl px-5"
                  >
                    <UploadSimple className="mr-2 size-4" weight="duotone" />
                    Bulk upload
                  </Button>
                </div>
              }
            />
          </motion.div>
        ) : filteredProducts.length === 0 ? (
          <motion.div
            key="no-matches"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <EmptyState
              icon={<Funnel weight="duotone" />}
              title="No matches"
              description="Try another search or category, or clear filters"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setProductSearch("");
                    setCategoryFilter("__all__");
                  }}
                  className="rounded-xl"
                >
                  Clear filters
                </Button>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="products-list"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-12"
          >
            {displayCategories.map((category) => (
              <div key={category} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    {category}
                  </h2>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="grid gap-3">
                  {filteredProducts
                    .filter((p) => (p.category ?? "Uncategorized") === category)
                    .map((product) => (
                      <motion.div
                        key={product.id}
                        variants={itemVariants}
                        layout
                        className="group relative flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/20 hover:shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center text-muted-foreground/40">
                                <ImageIcon className="size-6" weight="duotone" />
                              </div>
                            )}
                            {!product.available && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                                <EyeSlash className="size-5 text-muted-foreground" weight="duotone" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-foreground">
                                {product.name}
                              </h3>
                              {product.dietaryTags?.slice(0, 3).map((tag) => (
                                <div
                                  key={tag}
                                  className="size-1.5 rounded-full bg-primary/40"
                                  title={dietaryTagDisplayLabel(tag, vendorSettings?.customDietaryTags ?? [], mergedPlatformDietaryPresets)}
                                />
                              ))}
                            </div>
                            {product.description && (
                              <p className="line-clamp-1 text-xs text-muted-foreground/80">
                                {product.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-muted-foreground/60">
                              <PriceDisplay cents={product.priceCents} className="text-foreground" />
                              {product.variants?.length ? (
                                <span className="flex items-center gap-1">
                                  <SquaresFour className="size-3" />
                                  {product.variants.length} variants
                                </span>
                              ) : null}
                              {product.modifierGroups?.length ? (
                                <span className="flex items-center gap-1">
                                  <ListBullets className="size-3" />
                                  {product.modifierGroups.length} groups
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEdit(product)}
                            className="rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          >
                            <PencilSimple className="size-4" weight="duotone" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              toggleMutation.mutate({
                                id: product.id,
                                available: !product.available,
                              })
                            }
                            className={cn(
                              "rounded-lg text-muted-foreground hover:bg-primary/10",
                              !product.available && "text-primary bg-primary/5"
                            )}
                          >
                            {product.available ? (
                              <Eye className="size-4" weight="duotone" />
                            ) : (
                              <EyeSlash className="size-4" weight="duotone" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteMutation.mutate(product.id)}
                            className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash className="size-4" weight="duotone" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
