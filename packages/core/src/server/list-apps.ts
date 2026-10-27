import { appsList } from "@patchsmith/client-platform/client";
import type { AppsListResponses } from "@patchsmith/client-platform/client/types.gen";

import { withAppSlug } from "./app-slug";
import type { Context } from "./context";
import type { PatchsmithNamedScope } from "./types";

export const listApps = async (
  context: Pick<Context, "platform" | "platformHeaders" | "localSlugPrefix">,
  scopes: PatchsmithNamedScope[],
  signal: AbortSignal
): Promise<AppsListResponses[200]["items"]> => {
  const items: AppsListResponses[200]["items"] = [];
  let page = 1;

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- Each discovery page depends on the preceding pagination response.
    const { data } = await appsList({
      body: { page, pageSize: 100, scopes },
      client: context.platform,
      headers: context.platformHeaders,
      responseStyle: "fields",
      signal,
      throwOnError: true,
    });

    items.push(
      ...data.items.map((app) => withAppSlug(app, context.localSlugPrefix))
    );

    if (!data.pagination.hasMore) {
      return items;
    }

    page += 1;
  }
};
