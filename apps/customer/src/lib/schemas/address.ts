import { z } from "zod";

export const addressFormSchema = z.object({
  label: z.string().default(""),
  addressLine1: z.string().trim().min(1, "Address line 1 is required"),
  addressLine2: z.string().default(""),
  city: z.string().default(""),
  postcode: z.string().default(""),
  isDefault: z.boolean().default(false),
});

export type AddressFormInput = z.infer<typeof addressFormSchema>;

export const emptyAddressForm: AddressFormInput = {
  label: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  isDefault: false,
};
