// The sandbox provides the source URL; the build supplies the content-addressed manifest.
declare global {
  var __patchsmithAppUrl: string | undefined;
  var __patchsmithAssets: Record<string, string> | undefined;
}

/** Resolve a file from the app's assets directory to its immutable hosted URL. */
export const assetUrl = (path: string): string => {
  const assets = globalThis.__patchsmithAssets;
  const appUrl = globalThis.__patchsmithAppUrl;

  if (!assets || !Object.hasOwn(assets, path)) {
    throw new Error(`Unknown app asset: ${path}`);
  }

  if (appUrl === undefined || appUrl === "") {
    throw new Error("App asset URLs require the Patchsmith sandbox runtime.");
  }

  return new URL(`../../../assets/${assets[path]}/${path}`, appUrl).href;
};
