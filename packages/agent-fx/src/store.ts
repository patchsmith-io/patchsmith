export const sessionStore = async () => {
  const { db } = await import("@patchsmith/db");

  const { appAgentLease, appAgentThread } =
    await import("@patchsmith/db/schema/apps");

  return { appAgentLease, appAgentThread, db };
};

export type SessionStore = Awaited<ReturnType<typeof sessionStore>>;
