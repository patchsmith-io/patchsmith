import { appsInstall } from "@patchsmith/client-platform/client";
import type { Client } from "@patchsmith/client-platform/client/client/index";
import * as v from "valibot";

import { withAppSlug } from "#server/app-slug";
import type { LocalSlugPrefix } from "#server/app-slug";
import { platformAppSelector } from "#server/platform-app-selector";

import { selectPatchsmithScopes, validatePatchsmithScopes } from "./scope";
import type { PatchsmithScopeSchemas } from "./scope";
import type {
  PatchsmithInstallAppOptions,
  PatchsmithPlatformOptions,
} from "./types";

const isFunctionValue = <TValue>(
  value: TValue
): value is Extract<TValue, CallableFunction> => typeof value === "function";

export const createExperimental = (options: {
  localSlugPrefix?: LocalSlugPrefix;
  platform: Client;
  platformHeaders?: PatchsmithPlatformOptions["headers"];
  scopeSchemas: PatchsmithScopeSchemas;
}) => ({
  installApp: async <TScopes>(input: PatchsmithInstallAppOptions<TScopes>) => {
    if (!input.appId || input.appId.length > 256) {
      throw new TypeError("A deployed app ID is required.");
    }

    const scope = v.parse(
      v.strictObject({ name: v.string(), value: v.unknown() }),
      input.scope
    );

    const scopes = await validatePatchsmithScopes(options.scopeSchemas, {
      [scope.name]: scope.value,
    });

    const [validatedScope] = selectPatchsmithScopes(scopes, [scope.name]);

    if (!validatedScope) {
      throw new TypeError("An installation scope is required.");
    }

    const headers = await (isFunctionValue(options.platformHeaders)
      ? options.platformHeaders()
      : options.platformHeaders);

    if (
      !(
        new Headers(headers).get("authorization")?.startsWith("Bearer ") ===
        true
      )
    ) {
      throw new Error("A Patchsmith projectKey is required to install apps.");
    }

    const { data } = await appsInstall({
      body: { app: platformAppSelector(input.appId), scope: validatedScope },
      client: options.platform,
      headers,
      responseStyle: "fields",
      throwOnError: true,
    });

    return withAppSlug(data, options.localSlugPrefix);
  },
});
