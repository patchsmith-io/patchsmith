import type { UIMessageChunk } from "ai";
import * as v from "valibot";

import type { AppAgentChatData } from "#client/types.gen";

export type AgentModel = NonNullable<
  Extract<AppAgentChatData["body"], { type: "turn" }>["model"]
>;

// Keep the host validator exhaustive against the generated platform contract.
export const agentModelSchema = v.enum({
  "anthropic/claude-opus-5.5": "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5": "anthropic/claude-sonnet-5.5",
  "deepseek/deepseek-v4.1-flash": "deepseek/deepseek-v4.1-flash",
  "openai/gpt-6-astra": "openai/gpt-6-astra",
  "openai/gpt-6.1-sol": "openai/gpt-6.1-sol",
  "openai/gpt-6.1-sol-fast": "openai/gpt-6.1-sol-fast",
} satisfies { [TModel in AgentModel]: TModel });

export const agentCreateAppSchema = v.strictObject({
  description: v.nullable(v.pipe(v.string(), v.maxLength(255))),
  name: v.pipe(v.string(), v.maxLength(127)),
  slug: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(32),
      v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    )
  ),
});

export { agentChunkSchema } from "#agent-chunks";

export type AgentChunk = UIMessageChunk;

/** Parts stay extensible; the platform validates their SDK shapes before running. */
export const agentMessagesSchema = v.pipe(
  v.array(
    v.object({
      id: v.pipe(v.string(), v.minLength(1)),
      metadata: v.optional(v.unknown()),
      parts: v.pipe(
        v.array(v.looseObject({ type: v.string() })),
        v.minLength(1)
      ),
      role: v.picklist(["user", "assistant"]),
    })
  ),
  v.minLength(1)
);

const agentTurnSchema = v.object({
  appId: v.pipe(v.string(), v.minLength(1)),
  hostUrl: v.pipe(
    v.string(),
    v.url(),
    v.check((value) => /^https?:$/u.test(new URL(value).protocol))
  ),
  messages: agentMessagesSchema,
  schema: v.optional(v.record(v.string(), v.unknown())),
  threadId: v.optional(v.pipe(v.string(), v.uuid())),
  type: v.literal("turn"),
});

const agentResumeSchema = v.object({
  appId: v.pipe(v.string(), v.minLength(1)),
  runId: v.pipe(v.string(), v.startsWith("wrun_")),
  startIndex: v.pipe(v.number(), v.integer(), v.minValue(0)),
  threadId: v.pipe(v.string(), v.uuid()),
  token: v.pipe(v.string(), v.minLength(1)),
  type: v.literal("resume"),
});

export const agentChatSchema = v.variant("type", [
  agentTurnSchema,
  agentResumeSchema,
]);

/** The signed run identity permits reconnecting without submitting another turn. */
export const agentRunChunkSchema = v.object({
  data: v.object({
    runId: v.pipe(v.string(), v.startsWith("wrun_")),
    threadId: v.pipe(v.string(), v.uuid()),
    token: v.pipe(v.string(), v.minLength(1)),
  }),
  transient: v.literal(true),
  type: v.literal("data-run"),
});

export const agentRunCompleteChunkSchema = v.object({
  data: v.object({ runId: v.pipe(v.string(), v.startsWith("wrun_")) }),
  transient: v.literal(true),
  type: v.literal("data-run-complete"),
});

export type AgentRunCursor = v.InferOutput<
  typeof agentRunChunkSchema
>["data"] & {
  startIndex: number;
};
