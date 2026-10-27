import { ORPCError } from "@orpc/server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export type LocalSlugPrefix = "@" | "~" | "_";

export const defaultLocalSlugPrefix = "@";

/** Internal overrides are restricted to single-character namespace markers. */
export const validateLocalSlugPrefix = (
  prefix: string = defaultLocalSlugPrefix
): LocalSlugPrefix => {
  if (prefix !== "@" && prefix !== "~" && prefix !== "_") {
    throw new TypeError('localSlugPrefix must be "@", "~", or "_".');
  }

  return prefix;
};

export const withAppSlug = <T extends { slug?: string; isShared?: boolean }>(
  app: T,
  prefix: LocalSlugPrefix = defaultLocalSlugPrefix
): T => {
  if (app.slug === undefined || app.isShared !== false) {
    return app;
  }

  return { ...app, slug: prefix + app.slug };
};

/** The platform stores raw names; only the host interprets its configured prefix. */
export const slugSelector = (
  value: string,
  prefix: LocalSlugPrefix = defaultLocalSlugPrefix
) => {
  const local = value.startsWith(prefix);
  const slug = local ? value.slice(prefix.length) : value;

  if (slug.length > 32 || !slugPattern.test(slug)) {
    throw new ORPCError("BAD_REQUEST", { message: "Invalid app slug." });
  }

  return { isShared: !local, slug };
};
