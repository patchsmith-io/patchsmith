export { resolveAppSourceRoot } from "#source-root";

export {
  createPatchsmithUploadManifest,
  patchsmithUploadManifestSchema,
  type PatchsmithUploadManifest,
} from "./upload-manifest";

export {
  generateAppMigrations,
  type GenerateAppMigrationsOptions,
} from "./generate-migrations";

export { getClientSourceFiles } from "./file-routes";

export {
  discoverFunctionFiles,
  generateFunctionTypes,
  renderFunctionTypes,
  type FunctionFile,
} from "./file-functions";

export { discoverHooks } from "./hooks";
