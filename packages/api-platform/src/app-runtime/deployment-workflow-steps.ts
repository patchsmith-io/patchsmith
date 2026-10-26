import type { RuntimeRollout } from "./deployment-steps";

export const listRuntimeInstallations = async (
  input: RuntimeRollout,
  cursor?: string
) => {
  "use step";

  const { listRuntimeInstallationsEffect } = await import("./deployment-steps");
  const { runPlatform } = await import("#services");

  return await runPlatform(listRuntimeInstallationsEffect(input, cursor));
};

export const warmRuntimeDeployment = async (
  projectId: string,
  appId: string
) => {
  "use step";
  const { warmRuntimeDeploymentEffect } = await import("./deployment-steps");
  const { runPlatform } = await import("#services");
  await runPlatform(warmRuntimeDeploymentEffect(projectId, appId));
};
