import { getBaseUrl } from "@patchsmith/env";

import { env } from "#env";

const hasText = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value.length > 0;

interface AppDeploymentAssets {
  app?: { shortId: string } | null;
  views?: { slot: string; path: string; instances?: true; disabled?: true }[];
  clientEntryFileId: string | null;
  logoDarkPath?: string | null;
  logoLightPath?: string | null;
  shortId: string;
  status: string;
}

export const withAppAssetUrl = <
  T extends {
    currentDeployment: AppDeploymentAssets | null;
    shortId: string;
  },
>(
  app: T,
  projectShortId: string
) => {
  const deployment = app.currentDeployment;

  const nodeBaseUrl =
    env.ASSET_BASE_URL ??
    (env.NODE_ENV === "development"
      ? `${getBaseUrl(env)}/api/assets`
      : undefined);

  const assetBaseUrl = hasText(nodeBaseUrl)
    ? `${nodeBaseUrl.replace(/\/$/u, "")}/p/${projectShortId}`
    : `https://${projectShortId}.${env.ASSET_DOMAIN}`;

  let clientPath: string | undefined;
  let logoPaths: { dark?: string; light?: string } | undefined;

  if (
    deployment?.status === "published" &&
    hasText(deployment.clientEntryFileId)
  ) {
    const assetAppId = deployment.app?.shortId ?? app.shortId;
    const appBase = `${assetBaseUrl}/a/${assetAppId}`;
    const deploymentBase = `${appBase}/d/${deployment.shortId}`;
    clientPath = `${deploymentBase}/client/client.js`;
    const getLogoUrl = (path: string) => `${appBase}/${path}`;
    const logos: NonNullable<typeof logoPaths> = {};

    if (hasText(deployment.logoDarkPath)) {
      logos.dark = getLogoUrl(deployment.logoDarkPath);
    }

    if (hasText(deployment.logoLightPath)) {
      logos.light = getLogoUrl(deployment.logoLightPath);
    }

    if (Object.keys(logos).length > 0) {
      logoPaths = logos;
    }
  }

  return {
    ...app,
    clientPath,
    logoPaths,
    views: deployment?.status === "published" ? (deployment.views ?? []) : [],
  };
};
