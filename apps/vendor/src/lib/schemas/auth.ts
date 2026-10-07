import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address." }),
  password: z.string().min(1, { message: "Enter your password." }),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const totpSchema = z.object({
  token: z
    .string()
    .regex(/^\d{6}$/u, { message: "Enter the 6-digit authenticator code." }),
});

export type TotpInput = z.infer<typeof totpSchema>;
