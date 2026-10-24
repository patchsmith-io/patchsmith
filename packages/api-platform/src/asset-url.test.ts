import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { withAppAssetUrl } from "./asset-url";

// SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
const env = vi.hoisted(() => ({
  ASSET_BASE_URL: undefined as string | undefined,
  ASSET_DOMAIN: "tailorkit.app",
  NODE_ENV: "production" as "development" | "production",
  PORT: undefined as number | undefined,
}));

vi.mock("../../api-utils/src/env.ts", () => ({ env }));

const projectShortId = "proj00000001";
const appId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const appShortId = "app000000001";
const deploymentShortId = "deploy000001";

describe("hosted asset URLs", () => {
  afterEach(() => {
    env.ASSET_BASE_URL = undefined;
    env.NODE_ENV = "production";
  });

  it("uses stable project, app and deployment short IDs", () => {
    const app = {
      currentDeployment: {
        appId,
        clientEntryFileId: "55555555-5555-4555-8555-555555555555",
        createdAt: new Date(),
        errorMessage: null,
        id: deploymentId,
        logoDarkPath: `assets/${"a".repeat(64)}/logo.svg`,
        logoLightPath: `assets/${"b".repeat(64)}/logo.webp`,
        publishedAt: new Date(),
        shortId: deploymentShortId,
        status: "published" as const,
        updatedAt: new Date(),
      },
      id: appId,
      shortId: appShortId,
    };

    expect(withAppAssetUrl(app, projectShortId).clientPath).toBe(
      `https://${projectShortId}.tailorkit.app/a/${appShortId}/d/${deploymentShortId}/client/client.js`
    );
    expect(withAppAssetUrl(app, projectShortId).logoPaths).toEqual({
      dark: `https://${projectShortId}.tailorkit.app/a/${appShortId}/assets/${"a".repeat(64)}/logo.svg`,
      light: `https://${projectShortId}.tailorkit.app/a/${appShortId}/assets/${"b".repeat(64)}/logo.webp`,
    });
  });

  it("uses deployment URLs for content-addressed logos without duplicating stored files", () => {
    const logoHash = "b".repeat(64);

    const app = {
      currentDeployment: {
        clientEntryFileId: "55555555-5555-4555-8555-555555555555",
        logoDarkPath: `assets/${logoHash}/logo.svg`,
        logoLightPath: null,
        shortId: deploymentShortId,
        status: "published" as const,
      },
      shortId: appShortId,
    };

    expect(withAppAssetUrl(app, projectShortId).logoPaths).toEqual({
      dark: `https://${projectShortId}.tailorkit.app/a/${appShortId}/assets/${logoHash}/logo.svg`,
    });
  });

  it("uses the same-origin Node route in local development", () => {
    env.NODE_ENV = "development";

    const app = {
      currentDeployment: {
        appId,
        clientEntryFileId: "55555555-5555-4555-8555-555555555555",
        createdAt: new Date(),
        errorMessage: null,
        id: deploymentId,
        publishedAt: new Date(),
        shortId: deploymentShortId,
        status: "published" as const,
        updatedAt: new Date(),
      },
      shortId: appShortId,
    };

    expect(withAppAssetUrl(app, projectShortId).clientPath).toBe(
      `http://localhost:3000/api/assets/p/${projectShortId}/a/${appShortId}/d/${deploymentShortId}/client/client.js`
    );
  });

  it("supports the Node asset route in self-hosted production", () => {
    env.ASSET_BASE_URL = "https://patchsmith.example.com/api/assets/";

    const app = {
      currentDeployment: {
        appId,
        clientEntryFileId: "55555555-5555-4555-8555-555555555555",
        createdAt: new Date(),
        errorMessage: null,
        id: deploymentId,
        publishedAt: new Date(),
        shortId: deploymentShortId,
        status: "published" as const,
        updatedAt: new Date(),
      },
      shortId: appShortId,
    };

    expect(withAppAssetUrl(app, projectShortId).clientPath).toBe(
      `https://patchsmith.example.com/api/assets/p/${projectShortId}/a/${appShortId}/d/${deploymentShortId}/client/client.js`
    );
  });

  it("does not expose incomplete deployments", () => {
    const deployment = {
      appId,
      clientEntryFileId: null,
      createdAt: new Date(),
      errorMessage: null,
      id: deploymentId,
      publishedAt: null,
      shortId: deploymentShortId,
      status: "uploading" as const,
      updatedAt: new Date(),
    };

    expect(
      withAppAssetUrl(
        { currentDeployment: deployment, shortId: appShortId },
        projectShortId
      ).clientPath
    ).toBeUndefined();
  });
});
