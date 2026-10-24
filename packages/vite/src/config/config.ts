import * as v from "valibot";

export const logoPathSchema = v.pipe(
  v.string(),
  v.maxLength(512),
  v.regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*\.(?:png|svg|webp)$/u
  )
);

export const logosConfigSchema = v.object({
  dark: v.optional(logoPathSchema),
  light: v.optional(logoPathSchema),
});

const patchsmithConfigSchema = v.strictObject({
  appId: v.optional(v.pipe(v.string(), v.minLength(1))),
  description: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(255)))
  ),
  host: v.pipe(v.string(), v.url()),
  logos: v.optional(logosConfigSchema),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  server: v.optional(
    v.strictObject({
      migrations: v.optional(v.pipe(v.string(), v.minLength(1))),
    })
  ),
  slug: v.pipe(
    v.string(),
    v.minLength(3),
    v.maxLength(32),
    v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  ),
});

/**
 * App configuration exported from `patchsmith.config.ts`.
 * Logo paths resolve from the app’s assets/ directory; other paths resolve from the app root.
 */
export interface PatchsmithConfig extends v.InferInput<
  typeof patchsmithConfigSchema
> {
  /**
   * ID of the app on the Patchsmith host, used for deployment.
   * When omitted, the first deployment creates an app and saves its ID here.
   * @default undefined
   */
  appId?: string;
  /**
   * App description applied during deployment, including updates to an existing app.
   * Trimmed to remove surrounding whitespace; accepts at most 255 characters.
   * Set to null to clear the description. When omitted, existing apps keep their
   * current description and new apps have no description.
   * @default undefined
   */
  description?: string | null;
  /**
   * URL of the Patchsmith host used for authentication, deployment,
   * and fetching the host schema for generated types. Required; has no default.
   */
  host: string;
  /**
   * Optional app logo assets included in the build and uploaded on deployment.
   * Accepts SVG, PNG, or WebP files. Omit to upload no custom logos.
   * @default undefined
   */
  logos?: {
    /**
     * Path relative to assets/ for the app logo in dark mode. Omit to upload no dark-mode logo.
     * @default undefined
     */
    dark?: string;
    /**
     * Path relative to assets/ for the app logo in light mode. Omit to upload no light-mode logo.
     * @default undefined
     */
    light?: string;
  };
  /**
   * App name applied during deployment, including updates to an existing app.
   * Trimmed to remove surrounding whitespace; must not be blank.
   * Required; has no default.
   */
  name: string;
  /**
   * Optional settings for the private app backend, which is always built.
   * Omit to use the default migration path.
   * @default undefined
   */
  server?: {
    /**
     * Directory containing Drizzle migrations, used for generation and bundling.
     * When omitted, uses `./src/db/migrations` and allows that directory to be absent.
     * An explicitly configured directory must exist when building the backend.
     * @default "./src/db/migrations"
     */
    migrations?: string;
  };
  /**
   * Permanent app slug used when creating an app during deployment.
   * Use 3–32 lowercase letters or digits, separated by single hyphens.
   * Existing linked apps keep their slug. Required; has no default.
   */
  slug: string;
}

export type ResolvedPatchsmithConfig = v.InferOutput<
  typeof patchsmithConfigSchema
>;

export { patchsmithConfigSchema };

export const defineConfig = (config: PatchsmithConfig): PatchsmithConfig =>
  config;

export const definePatchsmithConfig = defineConfig;
