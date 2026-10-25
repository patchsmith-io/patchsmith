// @vitest-environment happy-dom
import {
  createFileClient,
  createRemoteComponent,
} from "@patchsmith/app/client";
import type { RemoteCallbackOperation } from "@patchsmith/app/client";
import * as v from "valibot";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { sandboxMessageType } from "#bridge";
import { IframeToHostPayload } from "#protocol";

import type { AppClient, ViewRequest } from "./resolve-view";
import { startIframeRuntime } from "./runtime";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const setup = (module: { default?: unknown; mount?: () => void }) => {
  const root = document.createElement("div");
  const messages: IframeToHostPayload[] = [];
  const envelope = v.object({ payload: IframeToHostPayload });

  const postMessage = vi
    .spyOn(window, "postMessage")
    .mockImplementation((message: Parameters<Window["postMessage"]>[0]) => {
      const parsed = v.safeParse(envelope, message);

      if (parsed.success) {
        messages.push(parsed.output.payload);
      }
    });

  cleanups.push(() => {
    postMessage.mockRestore();
  });
  const parentWindow = window;
  const importModule = vi.fn(async () => await Promise.resolve(module));
  cleanups.push(
    startIframeRuntime({ channel: "test", importModule, parentWindow, root })
  );

  const send = (payload: MessageEvent<unknown>["data"]) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: "test", payload, type: sandboxMessageType },
        source: parentWindow,
      })
    );
  };

  const update = (props: ViewRequest) => {
    send({
      data: {
        appSource: "client",
        appUrl: "https://apps.test/client.js",
        props,
      },
      type: "init",
    });
  };

  return {
    importModule,
    messages,
    parentWindow: { postMessage },
    root,
    send,
    update,
  };
};

const requestImplementation = (name: string): ViewRequest => ({
  declaredViews: ["/"],
  layers: [{ context: { name }, path: "/", status: "ready" }],
  slot: "panel",
  supportedViews: ["/"],
  view: "/",
});

it("installs the source app URL before evaluating asset references in the client", async () => {
  const client = createFileClient({
    layouts: [],
    root: undefined,
    roots: [],
    views: [],
  });

  const runtime = setup({ default: client });
  runtime.importModule.mockImplementation(async () => {
    expect(globalThis.__patchsmithAppUrl).toBe("https://apps.test/client.js");

    return await Promise.resolve({ default: client });
  });
  runtime.update(requestImplementation("asset-source"));
  await vi.waitFor(() => {
    expect(runtime.importModule).toHaveBeenCalledOnce();
  });
});

it("imports once, publishes updates, clears unsupported slots, and dispatches callbacks", async () => {
  let clicks = 0;

  // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
  const client: AppClient = {
    $runtime: {
      h: (component, props) => component(props),
      render: (node, root) => {
        root.replaceChildren(...(node instanceof Node ? [node] : []));
      },
    },
    slots: {
      panel: {
        "/": {
          component: (props) => {
            const button = document.createElement("patchsmith-button");
            button.textContent = String(props.context?.name);
            button.dataset.patchsmithCallbacks = JSON.stringify({
              click: { callback: "onClick", inputCount: 0 },
            });
            button.addEventListener("click", () => {
              button.textContent = String((clicks += 1));
            });

            return button;
          },
        },
      },
    },
  };

  const runtime = setup({ default: client });
  const request = requestImplementation;
  runtime.update(request("first"));
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe("first");
  });

  const snapshot = runtime.messages.find(
    (message) => message.type === "snapshot"
  );

  if (snapshot?.type !== "snapshot" || snapshot.data.tree.kind === "text") {
    throw new Error("Expected a rendered snapshot");
  }

  const [button] = snapshot.data.tree.children;

  if (button?.kind !== "element") {
    throw new Error("Expected a button element");
  }

  expect(button.callbacks).toEqual([
    { callback: "onClick", event: "click", inputCount: 0 },
  ]);
  runtime.send({
    data: { args: [], event: "click", id: "click", nodeId: button.id },
    type: "dispatchCallback",
  });
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe("1");
  });
  runtime.update(request("second"));
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe("second");
  });
  expect(runtime.importModule).toHaveBeenCalledTimes(1);
  runtime.update({ ...request("second"), slot: "unsupported" });
  await vi.waitFor(() => {
    expect(runtime.root.childNodes).toHaveLength(0);
  });

  const cleared = runtime.messages.findLast(
    (message) => message.type === "snapshot"
  );

  expect(
    cleared?.type === "snapshot" && cleared.data.tree.kind !== "text"
      ? cleared.data.tree.children
      : null
  ).toEqual([]);
});

it("reports a mount-only module instead of bypassing view resolution", async () => {
  const mount =
    vi.fn<NonNullable<NonNullable<Parameters<typeof setup>[0]>["mount"]>>();

  const runtime = setup({ mount });
  runtime.update({
    declaredViews: [],
    layers: [],
    slot: "panel",
    supportedViews: [],
    view: "/",
  });
  await vi.waitFor(() => {
    const error = runtime.messages.find((message) => message.type === "error");
    expect(error?.type === "error" ? error.data.message : null).toContain(
      "app builder"
    );
  });
  expect(mount).not.toHaveBeenCalled();
});

it("renders controlled requests and updates their context without reimporting the app", async () => {
  // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
  const client: AppClient = {
    $runtime: {
      h: (component, props) => component(props),
      render: (node, root) => {
        root.replaceChildren(...(node instanceof Node ? [node] : []));
      },
    },
    slots: {
      panel: {
        "/users/detail": {
          component: (props) => {
            if (props.status !== "ready") {
              return null;
            }

            return document.createTextNode(
              `${String(props.context.workspaceId)}:${String(props.context.userId)}`
            );
          },
        },
      },
    },
  };

  const runtime = setup({ default: client });

  const request = {
    context: { userId: "u1", workspaceId: "w1" },
    controlled: true as const,
    declaredViews: ["/", "/users", "/users/detail"],
    slot: "panel",
    status: "ready" as const,
    supportedViews: ["/users/detail"],
    view: "/users/detail",
  };

  runtime.update(request);
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe("w1:u1");
  });
  runtime.update({ ...request, context: { userId: "u2", workspaceId: "w1" } });
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe("w1:u2");
  });
  runtime.update({
    ...request,
    context: undefined,
    status: "loading" as const,
  });
  await vi.waitFor(() => {
    expect(runtime.root.childNodes).toHaveLength(0);
  });
  expect(runtime.importModule).toHaveBeenCalledTimes(1);
});

it("forwards selected instances through the bridge and switches them without reimporting", async () => {
  // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
  const client: AppClient = {
    $runtime: {
      h: (component, props) => component(props),
      render: (node, root) => {
        root.replaceChildren(...(node instanceof Node ? [node] : []));
      },
    },
    slots: {
      panel: {
        "/": {
          component: (props) =>
            props.status === "ready"
              ? document.createTextNode(
                  `${props.instance?.key}:${JSON.stringify(props.instance?.data)}`
                )
              : null,
          instances: { resolver: "compiled" },
        },
      },
    },
  };

  const runtime = setup({ default: client });

  const request = {
    context: {},
    controlled: true as const,
    declaredViews: ["/"],
    instance: { data: { count: 1 }, key: "overview", metadata: {} },
    slot: "panel",
    status: "ready" as const,
    supportedViews: ["/"],
    view: "/",
  };

  runtime.update(request);
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe('overview:{"count":1}');
  });
  runtime.update({
    ...request,
    instance: { data: { count: 2 }, key: "summary", metadata: {} },
  });
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe('summary:{"count":2}');
  });
  runtime.update({
    ...request,
    context: undefined,
    instance: undefined,
    status: "loading" as const,
  });
  await vi.waitFor(() => {
    expect(runtime.root.childNodes).toHaveLength(0);
  });
  runtime.update(request);
  await vi.waitFor(() => {
    expect(runtime.root.textContent).toBe('overview:{"count":1}');
  });
  expect(runtime.importModule).toHaveBeenCalledTimes(1);
});

const renderCallback = async (operation: RemoteCallbackOperation) => {
  vi.stubGlobal("__PREACT_VERSION__", "11.0.0");

  const Editor = createRemoteComponent<{ onSave: RemoteCallbackOperation }>(
    "Editor",
    { callbacks: { onSave: 1 } }
  );

  const app = createFileClient({
    layouts: [],
    roots: [],
    views: [
      {
        definition: {
          component: () => Editor({ onSave: operation }),
          path: "/",
          slot: "panel",
        },
        filename: "src/slots/panel/index.tsx",
        path: "/",
        slot: "panel",
      },
    ],
  });

  const runtime = setup({ default: app });
  runtime.update(requestImplementation("editor"));
  await vi.waitFor(() => {
    expect(runtime.root.querySelector("patchsmith-editor")).not.toBeNull();
  });

  const snapshot = runtime.messages.findLast(
    (message) => message.type === "snapshot"
  );

  if (snapshot?.type !== "snapshot" || snapshot.data.tree.kind === "text") {
    throw new Error("Expected a snapshot");
  }

  const [editor] = snapshot.data.tree.children;

  if (editor?.kind !== "element") {
    throw new Error("Expected an editor");
  }

  const invoke = (id: string, args: unknown[] = []) => {
    runtime.send({
      data: { args, event: "patchsmithcallbackonsave", id, nodeId: editor.id },
      type: "dispatchCallback",
    });
  };

  return { ...runtime, editor, invoke };
};

it.each<{ name: string; operation: RemoteCallbackOperation; output: unknown }>([
  { name: "sync", operation: () => ({ saved: true }), output: { saved: true } },
  {
    name: "async",
    operation: async () => await Promise.resolve(false),
    output: false,
  },
  { name: "void", operation: () => {}, output: undefined },
  {
    name: "async void",
    operation: async () => {
      await Promise.resolve();
    },
    output: undefined,
  },
])(
  "returns $name callback results through the real app adapter",
  async ({ operation, output }) => {
    const runtime = await renderCallback(operation);
    runtime.invoke("save");
    await vi.waitFor(() => {
      expect(runtime.messages).toContainEqual({
        data: { id: "save", output },
        type: "callbackResult",
      });
    });
  }
);

it.each([
  {
    name: "thrown",
    operation: () => {
      throw new Error("Save failed");
    },
  },
  {
    name: "rejected",
    operation: async () => {
      await Promise.resolve();
      throw new Error("Save failed");
    },
  },
])("returns $name callback failures", async ({ operation }) => {
  const runtime = await renderCallback(operation);
  runtime.invoke("save");
  await vi.waitFor(() => {
    expect(runtime.messages).toContainEqual({
      data: { error: "Save failed", id: "save" },
      type: "callbackResult",
    });
  });
});

it("correlates overlapping callbacks and slices serialized arguments", async () => {
  const resolveCalls: ((output: string) => void)[] = [];

  const operation = vi.fn<RemoteCallbackOperation>(async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    resolveCalls.push(resolve);

    return await promise;
  });

  const runtime = await renderCallback(operation);
  runtime.invoke("first", ["first", "extra"]);
  runtime.invoke("second", ["second"]);
  expect(operation).toHaveBeenNthCalledWith(1, "first");
  expect(operation).toHaveBeenNthCalledWith(2, "second");
  const [first, second] = resolveCalls;

  if (!first || !second) {
    throw new Error("Expected pending calls");
  }

  second("second result");
  first("first result");
  await vi.waitFor(() => {
    expect(runtime.messages).toContainEqual({
      data: { id: "first", output: "first result" },
      type: "callbackResult",
    });
    expect(runtime.messages).toContainEqual({
      data: { id: "second", output: "second result" },
      type: "callbackResult",
    });
  });
});

it("rejects callbacks to detached nodes and undeclared events", async () => {
  const operation = vi.fn<RemoteCallbackOperation>();
  const runtime = await renderCallback(operation);
  runtime.send({
    data: { event: "undeclared", id: "undeclared", nodeId: runtime.editor.id },
    type: "dispatchCallback",
  });
  runtime.root.replaceChildren();
  runtime.invoke("detached");
  await vi.waitFor(() => {
    for (const id of ["undeclared", "detached"]) {
      const result = runtime.messages.find(
        (message) => message.type === "callbackResult" && message.data.id === id
      );

      expect(
        result?.type === "callbackResult" ? result.data.error : undefined
      ).toContain("Cannot dispatch callback");
    }
  });
  expect(operation).not.toHaveBeenCalled();
});
