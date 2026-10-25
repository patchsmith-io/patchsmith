import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  isStaticAssetPath,
  maxDeploymentBytes,
  maxStaticAssets,
} from "@patchsmith/asset-delivery/static-assets";

import { forEachSequential } from "#for-each-sequential";

export interface StaticAsset {
  checksum: string;
  content: Buffer;
  path: string;
}

/** Snapshot the directory once so imported URLs and uploaded bytes always agree. */
export const readStaticAssets = async (
  root: string
): Promise<StaticAsset[]> => {
  const assets: StaticAsset[] = [];
  let totalBytes = 0;

  const scan = async (directory: string, prefix: string) => {
    let entries;

    try {
      const directoryInfo = await lstat(directory);

      if (directoryInfo.isSymbolicLink()) {
        throw new Error(`Asset symlinks are not supported: ${directory}`);
      }

      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        prefix === "" &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }

    await forEachSequential(
      entries.toSorted((a, b) => a.name.localeCompare(b.name)),
      async (entry) => {
        const filename = path.join(directory, entry.name);
        const assetPath = `${prefix}${entry.name}`;

        if (entry.isSymbolicLink()) {
          throw new Error(`Asset symlinks are not supported: ${assetPath}`);
        }

        if (!isStaticAssetPath(assetPath)) {
          throw new Error(`Invalid asset path: ${assetPath}`);
        }

        if (entry.isDirectory()) {
          await scan(filename, `${assetPath}/`);
        } else if (entry.isFile()) {
          const info = await lstat(filename);

          if (
            info.size < 1 ||
            info.size > maxDeploymentBytes ||
            totalBytes + info.size > maxDeploymentBytes ||
            assets.length >= maxStaticAssets
          ) {
            throw new Error(
              `Static asset size or count limit exceeded: ${assetPath}`
            );
          }

          const content = await readFile(filename);
          totalBytes += content.byteLength;

          if (
            content.byteLength < 1 ||
            content.byteLength > maxDeploymentBytes ||
            totalBytes > maxDeploymentBytes ||
            assets.length >= maxStaticAssets
          ) {
            throw new Error(
              `Static asset size or count limit exceeded: ${assetPath}`
            );
          }

          assets.push({
            checksum: createHash("sha256").update(content).digest("hex"),
            content,
            path: assetPath,
          });
        } else {
          throw new Error(`Unsupported asset file: ${assetPath}`);
        }
      }
    );
  };

  await scan(path.join(root, "assets"), "");

  return assets;
};

export const writeStaticAssets = async (
  output: string,
  assets: StaticAsset[]
) => {
  await forEachSequential(assets, async (asset) => {
    const filename = path.join(output, "assets", asset.path);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, asset.content);
  });
};
