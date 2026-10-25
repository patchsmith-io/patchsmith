import type { UIMessageChunk } from "ai";

/** Existing API fixtures provide transport output independently of native execution. */
export const fixtureAgentStream = (
  run:
    | Promise<{
        getReadable: (options?: {
          startIndex: number;
        }) => ReadableStream<UIMessageChunk>;
      }>
    | {
        getReadable: (options?: {
          startIndex: number;
        }) => ReadableStream<UIMessageChunk>;
      },
  startIndex?: number
): ReadableStream<UIMessageChunk> => {
  const transport = new TransformStream<UIMessageChunk, UIMessageChunk>();

  const forward = async () => {
    try {
      const resolved = await run;
      await resolved
        .getReadable(startIndex === undefined ? undefined : { startIndex })
        .pipeTo(transport.writable);
    } catch {
      // pipeTo propagates failures/cancellation to the fixture transport.
    }
  };

  void forward();

  return transport.readable;
};
