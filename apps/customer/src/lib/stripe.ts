import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const stripePromise = key ? loadStripe(key) : null;
