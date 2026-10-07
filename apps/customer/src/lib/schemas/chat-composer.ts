import { z } from "zod";

/** Keep aligned with `apps/server/config` → `chat.maxMessageLength` (default 2000). */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

export const chatComposerSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(
      CHAT_MESSAGE_MAX_LENGTH,
      `Message cannot exceed ${CHAT_MESSAGE_MAX_LENGTH} characters`
    ),
});

export type ChatComposerFormInput = z.infer<typeof chatComposerSchema>;

export const emptyChatComposerForm = (): ChatComposerFormInput => ({
  body: "",
});
