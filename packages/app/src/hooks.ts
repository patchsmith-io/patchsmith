/** Hook names owned and triggered by the platform, independent of host contracts. */
export const platformHookNames = Object.freeze([
  "patchsmith.onInstall",
] as const);

export type PlatformHookName = (typeof platformHookNames)[number];

export type ReservedHookName = "patchsmith" | `patchsmith.${string}`;

export type PlatformHooks = Record<
  PlatformHookName,
  { readonly input: undefined; readonly output: ReturnType<() => void> }
>;

export const isReservedHookName = (name: string): name is ReservedHookName =>
  name === "patchsmith" || name.startsWith("patchsmith.");

export const isPlatformHookName = (name: string): name is PlatformHookName =>
  platformHookNames.some((hook) => hook === name);
