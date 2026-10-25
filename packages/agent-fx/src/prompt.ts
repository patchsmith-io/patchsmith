import type { ModelMessage } from "ai";
import type { FxSessionImageBlock, FxSessionPromptInput } from "libfx";
import { z } from "zod";

const inlineImage = (value: string) => {
  if (value.startsWith("data:")) {
    const marker = value.indexOf(";base64,");

    if (marker === -1) {
      throw new Error("Agent images must be base64 encoded.");
    }

    return { data: value.slice(marker + 8), mimeType: value.slice(5, marker) };
  }

  if (URL.canParse(value)) {
    throw new Error(
      "Agent images must contain inline image data, not a remote URL."
    );
  }

  return { data: value, mimeType: undefined };
};

const imageSchema = z.union([
  z.string().transform(inlineImage),
  z.instanceof(URL).transform((value) => inlineImage(value.href)),
  z.instanceof(Uint8Array).transform((value) => ({
    data: Buffer.from(value).toString("base64"),
    mimeType: undefined,
  })),
  z.instanceof(ArrayBuffer).transform((value) => ({
    data: Buffer.from(value).toString("base64"),
    mimeType: undefined,
  })),
]);

const imagePartSchema = z
  .object({
    image: imageSchema,
    mediaType: z.string().optional(),
    type: z.literal("image"),
  })
  .transform((part): FxSessionImageBlock => ({
    data: part.image.data,
    mimeType: part.mediaType ?? part.image.mimeType ?? "image/png",
    type: "image",
  }));

const contentSchema = z.union([
  z.string(),
  z.array(
    z.union([
      z.object({ text: z.string(), type: z.literal("text") }),
      imagePartSchema,
    ])
  ),
]);

/** The native session owns history; validate and submit only the newest user message. */
export const getTurnPrompt = (
  messages: ModelMessage[]
): FxSessionPromptInput => {
  const message = messages.findLast((entry) => entry.role === "user");

  if (!message) {
    throw new Error("An app agent turn requires a user message.");
  }

  return contentSchema.parse(message.content);
};
