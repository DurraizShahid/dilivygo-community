/** Stored in `platform_banners.placement` — must match DB check constraint. */
export type PlatformBannerPlacement =
  | "home_promotions"
  | "home_below_hero"
  | "home_explore_deals"
  | "restaurant_list"
  | "restaurant_menu"
  | "cart"
  | "checkout"
  | "orders_list"
  | "order_detail"
  | "account"
  | "chat_list"
  | "chat_thread"
  | "login";

export type PlatformBannerPlacementOption = {
  id: PlatformBannerPlacement;
  label: string;
  /** Where it appears in the customer app */
  customerArea: string;
};

export const PLATFORM_BANNER_PLACEMENTS: PlatformBannerPlacementOption[] = [
  {
    id: "home_promotions",
    label: "Home — Promotions row",
    customerArea:
      "Main page, below the hero and above “Restaurants near you”",
  },
  {
    id: "home_below_hero",
    label: "Home — Below hero only",
    customerArea: "Main page, directly under the search hero (narrow strip)",
  },
  {
    id: "home_explore_deals",
    label: "Home — Explore your deals",
    customerArea: "Main page, under the cuisines section",
  },
  {
    id: "restaurant_list",
    label: "Restaurant / shop list",
    customerArea: "Home page while browsing the restaurant grid",
  },
  {
    id: "restaurant_menu",
    label: "Menu page",
    customerArea: "Inside a restaurant, above the product menu",
  },
  {
    id: "cart",
    label: "Cart",
    customerArea: "Shopping cart page",
  },
  {
    id: "checkout",
    label: "Checkout",
    customerArea: "Checkout / payment step",
  },
  {
    id: "orders_list",
    label: "Orders history",
    customerArea: "My orders list",
  },
  {
    id: "order_detail",
    label: "Order detail / tracking",
    customerArea: "Single order view and tracking",
  },
  {
    id: "account",
    label: "Account",
    customerArea: "Account / profile",
  },
  {
    id: "chat_list",
    label: "Chat inbox",
    customerArea: "Messages list",
  },
  {
    id: "chat_thread",
    label: "Chat conversation",
    customerArea: "Inside a chat thread",
  },
  {
    id: "login",
    label: "Login / OTP",
    customerArea: "Phone login and verification screens",
  },
];
