import { z } from "zod";

export const supportTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Please add a subject.")
    .max(200, "Keep the subject under 200 characters."),
  message: z.string().trim().min(1, "Please add a message."),
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
