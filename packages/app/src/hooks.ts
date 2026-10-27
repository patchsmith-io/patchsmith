/** Hook names owned and triggered by the platform, independent of host contracts. */
export const onInstallHook = "patchsmith.onInstall";

export type PlatformHookName = typeof onInstallHook;

export type ReservedHookName = "patchsmith" | `patchsmith.${string}`;

export type PlatformHooks = Record<
  PlatformHookName,
  { readonly input: undefined; readonly output: ReturnType<() => void> }
>;

export const isReservedHookName = (name: string): name is ReservedHookName =>
  name === "patchsmith" || name.startsWith("patchsmith.");

export const isPlatformHookName = (name: string): name is PlatformHookName =>
  name === onInstallHook;
