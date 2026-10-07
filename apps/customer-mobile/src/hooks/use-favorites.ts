import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export function useFavorites() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.favorites.list(),
    enabled: isAuthenticated,
  });
}

export function useFavoriteMutations() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["favorites"] });

  const toggleShop = useMutation({
    mutationFn: async ({ shopId, favorite }: { shopId: string; favorite: boolean }) => {
      if (!isAuthenticated) throw new Error("Please sign in to save favorites");
      if (favorite) return api.favorites.removeShop(shopId);
      return api.favorites.addShop(shopId);
    },
    onSuccess: invalidate,
  });

  const toggleProduct = useMutation({
    mutationFn: async ({ productId, favorite }: { productId: string; favorite: boolean }) => {
      if (!isAuthenticated) throw new Error("Please sign in to save favorites");
      if (favorite) return api.favorites.removeProduct(productId);
      return api.favorites.addProduct(productId);
    },
    onSuccess: invalidate,
  });

  return { toggleShop, toggleProduct };
}
