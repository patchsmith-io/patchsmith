/** Static files use raw bytes from the same budget as bundles and logos. */
export { maxDeploymentBytes, maxStaticAssets } from "./deployment-limits";

const assetPathPattern =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/u;

export const isStaticAssetPath = (path: string): boolean =>
  path.length <= 512 && assetPathPattern.test(path);

const contentTypes = new Map<string, string>([
  ["js", "application/javascript"],
  ["mjs", "application/javascript"],
  ["wasm", "application/wasm"],
  ["json", "application/json"],
  ["css", "text/css"],
  ["txt", "text/plain"],
  ["csv", "text/csv"],
  ["svg", "image/svg+xml"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["gif", "image/gif"],
  ["ico", "image/x-icon"],
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
  ["mp3", "audio/mpeg"],
  ["ogg", "audio/ogg"],
  ["wav", "audio/wav"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["pdf", "application/pdf"],
]);

export const staticAssetContentType = (path: string): string =>
  contentTypes.get(path.split(".").at(-1)?.toLowerCase() ?? "") ??
  "application/octet-stream";
