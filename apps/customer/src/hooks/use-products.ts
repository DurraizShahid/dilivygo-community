import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Product, Category, Workspace, Shop } from "@dilivygo/types";

export function useProducts(ref: string, shopId?: string) {
  return useQuery<Product[]>({
    queryKey: ["products", ref, shopId],
    queryFn: () =>
      shopId
        ? api.public.shopProducts(ref, shopId)
        : api.public.products(ref),
    enabled: !!ref,
  });
}

export function useWorkspace(ref: string) {
  return useQuery<Workspace>({
    queryKey: ["workspace", ref],
    queryFn: () => api.public.workspace(ref),
    enabled: !!ref,
  });
}

export function useShops(ref: string) {
  return useQuery<Shop[]>({
    queryKey: ["shops", ref],
    queryFn: () => api.public.shops(ref),
    enabled: !!ref,
  });
}

export function useShopDetail(ref: string, shopId: string) {
  return useQuery<Shop>({
    queryKey: ["shop", ref, shopId],
    queryFn: () => api.public.shopDetail(ref, shopId),
    enabled: !!ref && !!shopId,
  });
}

export function useShopCategories(ref: string, shopId: string) {
  return useQuery<Category[]>({
    queryKey: ["shop-categories", ref, shopId],
    queryFn: () => api.public.shopCategories(ref, shopId),
    enabled: !!ref && !!shopId,
  });
}
