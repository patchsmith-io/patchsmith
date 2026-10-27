import { App } from "@patchsmith/db/schema/apps";
import { z } from "zod";

/** Exactly one namespace: a slug may also look like a short ID or UUID. */
export const appSelectorSchema = z.union([
  z.strictObject({ id: z.uuid() }),
  z.strictObject({ shortId: App.shape.shortId }),
  z.strictObject({
    isShared: z
      .boolean()
      .optional()
      .describe(
        "Defaults to true for a project-wide name. Set false to resolve a local name within the supplied scopes."
      ),
    slug: App.shape.slug,
  }),
]);

export type AppSelector = z.infer<typeof appSelectorSchema>;

/** Slug namespace is explicit; IDs always address the same app. */
export const appSelectorWhere = (selector: AppSelector) => {
  if ("slug" in selector) {
    return { isShared: selector.isShared ?? true, slug: selector.slug };
  }

  return selector;
};
