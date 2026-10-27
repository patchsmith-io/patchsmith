import { ORPCError } from "@orpc/server";

const pathPrefixPattern = /^[A-Za-z0-9._~!$&'()*+,;=:@-]{1,32}$/u;
const namespaceMarkerPattern = /[^A-Za-z0-9-]/u;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const defaultLocalSlugPrefix = "@";

/** A prefix must fit one URL segment and distinguish local names from ordinary slugs. */
export const validateLocalSlugPrefix = (prefix = defaultLocalSlugPrefix) => {
  if (!pathPrefixPattern.test(prefix) || !namespaceMarkerPattern.test(prefix)) {
    throw new TypeError(
      "localSlugPrefix must contain 1–32 unencoded URL path characters, including a symbol other than a hyphen. Slashes, percent escapes, queries, and fragments are not allowed."
    );
  }

  return prefix;
};

export const withAppSlug = <T extends { slug?: string; isShared?: boolean }>(
  app: T,
  prefix = defaultLocalSlugPrefix
): T => {
  if (app.slug === undefined || app.isShared !== false) {
    return app;
  }

  return { ...app, slug: prefix + app.slug };
};

/** The platform stores raw names; only the host interprets its configured prefix. */
export const slugSelector = (
  value: string,
  prefix = defaultLocalSlugPrefix
) => {
  const local = value.startsWith(prefix);
  const slug = local ? value.slice(prefix.length) : value;

  if (slug.length > 32 || !slugPattern.test(slug)) {
    throw new ORPCError("BAD_REQUEST", { message: "Invalid app slug." });
  }

  return { isShared: !local, slug };
};
