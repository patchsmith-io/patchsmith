import type { RemoteCallbackOperation } from "@patchsmith/app/client";
import * as v from "valibot";

import { iframeReadyType, sandboxMessageType } from "#bridge";
import { readElementProps } from "#host/serialize";
import { HostToIframePayload, RemotePropsSchema } from "#protocol";
import type {
  IframeToHostPayload,
  RemoteCallbackBinding,
  RemoteNode,
} from "#protocol";

import { createIframeBackend } from "./backend";
import { createIframeCanvases } from "./canvas";
import { assertAppClient, renderClient } from "./resolve-view";
import type { AppClient, ViewRequest } from "./resolve-view";
import { createIframeTools } from "./tools";

type InitData = Extract<HostToIframePayload, { type: "init" }>["data"];

const readCallbacksImplementation = (
  element: Element
): RemoteCallbackBinding[] => {
  const value = element.attributes.getNamedItem(
    "data-patchsmith-callbacks"
  )?.value;

  if (!(value !== undefined && value !== null && value !== "")) {
    return [];
  }

  try {
    const parsed = v.safeParse(RemotePropsSchema, JSON.parse(value));

    if (!parsed.success) {
      return [];
    }

    const callbackSchema = v.object({
      callback: v.string(),
      inputCount: v.number(),
    });

    return Object.entries(parsed.output).flatMap(([event, config]) => {
      const callback = v.safeParse(callbackSchema, config);

      return callback.success ? [{ ...callback.output, event }] : [];
    });
  } catch {
    return [];
  }
};

export const startIframeRuntime = (options: {
  root: HTMLElement;
  channel: string;
  parentWindow?: Pick<Window, "postMessage">;
  importModule?: (url: string) => Promise<{ default?: unknown }>;
}): (() => void) => {
  const {
    root,
    channel,
    parentWindow = window.parent,

    importModule = async (url: string): Promise<{ default?: unknown }> =>
      v.parse(
        v.object({ default: v.optional(v.unknown()) }),
        // oxlint-disable-next-line no-inline-comments -- Vite requires this directive inside import() to preserve remote module loading.
        await import(/* @vite-ignore */ url)
      ),
  } = options;

  const nodeIds = new WeakMap<Node, string>();
  const nodes = new Map<string, WeakRef<Node>>();
  let nextNodeId = 1;
  let revision = 0;
  let loadedAppUrl: string | null = null;
  let client: AppClient | null = null;
  let rendering = false;
  let destroyed = false;

  const send = (payload: IframeToHostPayload) => {
    if (!destroyed) {
      parentWindow.postMessage(
        { channel, payload, type: sandboxMessageType },
        "*"
      );
    }
  };

  const tools = createIframeTools((data) => {
    send({ data, type: "toolRequest" });
  });

  const backend = createIframeBackend((data) => {
    send({ data, type: "backendSessionRequest" });
  });

  const backendGlobal = globalThis;

  const canvases = createIframeCanvases((data) => {
    send({ data, type: "canvasRequest" });
  });

  backendGlobal.__patchsmithRequestCanvas = canvases.request;
  backendGlobal.__patchsmithWatchCanvas = canvases.watch;
  backendGlobal.__patchsmithTools = tools.bridge;
  backendGlobal.__patchsmithBackendSession = backend.getSession;

  const sendError = (cause: unknown) => {
    let message = String(cause);

    if (cause instanceof Error) {
      message =
        cause.stack !== undefined && cause.stack !== ""
          ? cause.stack
          : cause.message;
    }

    send({
      data: { message },
      type: "error",
    });
  };

  const getNodeId = (node: Node): string => {
    let id = nodeIds.get(node);

    if (!(id !== undefined && id !== null && id !== "")) {
      id = `n:${(nextNodeId += 1) - 1}`;
      nodeIds.set(node, id);
      nodes.set(id, new WeakRef(node));
    }

    return id;
  };

  const readCallbacks = readCallbacksImplementation;

  const serializeNode = (node: Node): RemoteNode => {
    if (node instanceof Text) {
      return { id: getNodeId(node), kind: "text", text: node.data };
    }

    if (node instanceof Element) {
      return {
        callbacks: readCallbacks(node),
        children: Array.from(node.childNodes, serializeNode),
        id: getNodeId(node),
        kind: "element",
        props: readElementProps(node),
        type: node.localName,
      };
    }

    return {
      children: Array.from(node.childNodes, serializeNode),
      id: getNodeId(node),
      kind: "fragment",
    };
  };

  const sendSnapshot = () => {
    send({
      data: {
        revision: (revision += 1),
        tree: {
          children: Array.from(root.childNodes, serializeNode),
          id: getNodeId(root),
          kind: "fragment",
        },
      },
      type: "snapshot",
    });
  };

  const observer = new MutationObserver(() => {
    if (!rendering) {
      sendSnapshot();
    }
  });

  observer.observe(root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });

  const loadApp = async ({ appSource, appUrl, props }: InitData) => {
    if (destroyed) {
      return;
    }

    if (loadedAppUrl !== appUrl) {
      backendGlobal.__patchsmithAppUrl = appUrl;

      const module = await importModule(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(appSource)}`
      );

      if (destroyed) {
        return;
      }

      assertAppClient(module.default);
      client = module.default;
      loadedAppUrl = appUrl;
    }

    if (!client || !props) {
      throw new Error("Patchsmith app requires a view request.");
    }

    rendering = true;

    try {
      // SAFETY: The adapter reconstructs the same runtime contract, but TypeScript cannot relate the erased generic parameters across this library boundary.

      renderClient(
        client,
        /* oxlint-disable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- The adapter reconstructs the same runtime contract, but TypeScript cannot relate the erased generic parameters across this library boundary. */
        props as unknown as ViewRequest,
        /* oxlint-enable typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions */
        root
      );
    } finally {
      observer.takeRecords();
      rendering = false;
    }

    sendSnapshot();
  };

  let pendingLoad = Promise.resolve();

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== parentWindow) {
      return;
    }

    const parsed = v.safeParse(
      v.object({
        channel: v.literal(channel),
        payload: HostToIframePayload,
        type: v.literal(sandboxMessageType),
      }),
      event.data
    );

    if (!parsed.success) {
      return;
    }

    const { payload } = parsed.output;

    if (payload.type === "canvasAvailability") {
      canvases.availability(payload.data.name, payload.data.generation);

      return;
    }

    if (payload.type === "canvasResult") {
      canvases.receive(payload.data);

      return;
    }

    if (payload?.type === "toolResult") {
      tools.receive(payload.data);

      return;
    }

    if (payload?.type === "backendSessionResult") {
      backend.receive(payload.data);
    } else if (payload?.type === "init") {
      pendingLoad = (async () => {
        try {
          await pendingLoad;
          await loadApp(payload.data);
        } catch (error) {
          sendError(error);
        }
      })();
    } else if (payload?.type === "dispatchCallback") {
      const { id, nodeId, event: eventName, args } = payload.data;

      const respond = async (
        operation: RemoteCallbackOperation
      ): Promise<void> => {
        try {
          const output = await operation();
          send({ data: { id, output }, type: "callbackResult" });
        } catch (error) {
          send({
            data: {
              error: error instanceof Error ? error.message : String(error),
              id,
            },
            type: "callbackResult",
          });
        }
      };

      const target = nodes.get(nodeId)?.deref();

      if (
        !(target instanceof Element) ||
        !root.contains(target) ||
        !readCallbacks(target).some((binding) => binding.event === eventName)
      ) {
        void respond(() => {
          throw new Error(
            `Cannot dispatch callback "${eventName}" to node "${nodeId}".`
          );
        });

        return;
      }

      let invoked = false;

      const callbackEvent = Object.assign(
        new CustomEvent(eventName, {
          bubbles: false,
          cancelable: true,
          detail: args ?? [],
        }),
        {
          respondWith: (operation: RemoteCallbackOperation) => {
            if (invoked) {
              return;
            }

            invoked = true;
            void respond(operation);
          },
        }
      );

      target.dispatchEvent(callbackEvent);

      if (!invoked) {
        void respond(() => {
          throw new Error(`Callback "${eventName}" did not return a result.`);
        });
      }
    }
  };

  window.addEventListener("message", handleMessage);
  parentWindow.postMessage({ channel, type: iframeReadyType }, "*");
  send({ type: "ready" });

  return () => {
    canvases.close();

    if (backendGlobal.__patchsmithWatchCanvas === canvases.watch) {
      delete backendGlobal.__patchsmithWatchCanvas;
    }

    if (backendGlobal.__patchsmithRequestCanvas === canvases.request) {
      delete backendGlobal.__patchsmithRequestCanvas;
    }

    tools.close();

    if (backendGlobal.__patchsmithTools === tools.bridge) {
      delete backendGlobal.__patchsmithTools;
    }

    backend.close();

    if (backendGlobal.__patchsmithBackendSession === backend.getSession) {
      delete backendGlobal.__patchsmithBackendSession;
    }

    destroyed = true;
    delete backendGlobal.__patchsmithAppUrl;
    delete backendGlobal.__patchsmithAssets;
    observer.disconnect();
    window.removeEventListener("message", handleMessage);
    nodes.clear();
  };
};
