import { eventIterator, ORPCError } from "@orpc/server";
import {
  agentChatSchema,
  agentCreateAppSchema,
  agentChunkSchema,
  agentRunCompleteChunkSchema,
} from "@patchsmith/client-platform/agent";
import {
  appAgentChat,
  appAgentCreate,
} from "@patchsmith/client-platform/client";
import * as v from "valibot";

import { platformAppSelector } from "#server/platform-app-selector";
import {
  getCliDeployToken,
  o,
  requireCliDeployToken,
} from "#server/procedures";

/** CLI calls the host; only the host supplies the platform project credential. */
export const appAgentRouter = {
  chat: o
    .use(requireCliDeployToken)
    .input(agentChatSchema)
    .output(eventIterator(agentChunkSchema))
    .handler(async function* chat({ context, input, signal: clientSignal }) {
      const { appId, ...turn } = input;
      const controller = new AbortController();

      const signal = clientSignal
        ? AbortSignal.any([clientSignal, controller.signal])
        : controller.signal;

      try {
        let streamFailed = false;
        let done = false;

        const platformTurn =
          turn.type === "turn"
            ? {
                ...turn,
                instructions: context.agentInstructions,
                model: context.agentModel,
              }
            : turn;

        const { stream } = await appAgentChat({
          body: {
            ...platformTurn,
            app: platformAppSelector(appId),
            deployToken: getCliDeployToken(context.request),
          },

          client: context.platform,

          headers: context.platformHeaders,

          onSseError: () => {
            streamFailed = true;
          },

          signal,

          // Only the CLI can reconnect with the signed identity and exact cursor.
          sseMaxRetryAttempts: 1,
        });

        for await (const value of stream) {
          const event = await v.parseAsync(agentChunkSchema, value);

          if (
            event.type === "error" ||
            v.safeParse(agentRunCompleteChunkSchema, event).success
          ) {
            done = true;
          }

          yield event;
        }

        signal?.throwIfAborted();

        if (streamFailed) {
          throw new ORPCError("BAD_GATEWAY", {
            message: "The app agent stream failed. Try again.",
          });
        }

        if (!done) {
          throw new ORPCError("BAD_GATEWAY", {
            message: "The agent stream ended unexpectedly. Try again.",
          });
        }
      } finally {
        // Iterator cancellation must also terminate the upstream HTTP stream.
        controller.abort();
      }
    }),
  create: o
    .use(requireCliDeployToken)
    .input(agentCreateAppSchema)
    .handler(async ({ context, input }) => {
      const { data } = await appAgentCreate({
        body: { ...input, deployToken: getCliDeployToken(context.request) },
        client: context.platform,
        headers: context.platformHeaders,
        responseStyle: "fields",
        throwOnError: true,
      });

      return data;
    }),
};
