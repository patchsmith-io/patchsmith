// @vitest-environment happy-dom
import { h, render } from "preact";
import type { ComponentType, VNode } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { expect, it, vi } from "vite-plus/test";

import type { ShellProps } from "./routing";

vi.stubGlobal("__PREACT_VERSION__", "11.0.0");

const { createFileClient, defineRoute, Route } = await import("./routing");
const { defineView } = await import("./views");

it("keeps app and slot shells and common layouts mounted, and isolates mounted slots", async () => {
  const mounts = vi.fn<(name: string) => void>();
  const cleanup = vi.fn<(name: string) => void>();

  const Root = ({ children }: ShellProps) => {
    useLayoutEffect(() => {
      mounts("root");

      return () => {
        cleanup("root");
      };
    }, []);

    return h("section", {}, children);
  };

  const SlotRoot = () => {
    useLayoutEffect(() => {
      mounts("slot");

      return () => {
        cleanup("slot");
      };
    }, []);

    return h("main", {}, h(Route, {}));
  };

  const Layout = () => {
    const [count, setCount] = useState(0);
    useLayoutEffect(() => {
      mounts("layout");

      return () => {
        cleanup("layout");
      };
    }, []);

    return h(
      "div",
      {},
      h(
        "button",
        {
          onClick: () => {
            setCount(count + 1);
          },
        },
        `count:${count}`
      ),
      h(Route, {})
    );
  };

  const first = defineView({
    component: () => "first",
    slot: "panel",
    view: "/",
  });

  const users = defineView({
    component: () => "users",
    slot: "panel",
    view: "/users",
  });

  const client = createFileClient({
    layouts: [
      { definition: Layout, filename: "layout.tsx", path: "/", slot: "panel" },
    ],
    root: {
      definition: defineRoute({ shellComponent: Root }),
      filename: "slots/root.tsx",
    },
    roots: [
      {
        definition: defineRoute({ shellComponent: SlotRoot }),
        filename: "src/slots/panel/root.tsx",
        slot: "panel",
      },
    ],
    views: [
      {
        definition: first,
        filename: "index.view.tsx",
        path: "/",
        slot: "panel",
      },
      {
        definition: users,
        filename: "users.view.tsx",
        path: "/users",
        slot: "panel",
      },
    ],
  });

  const container = document.createElement("div");
  const other = document.createElement("div");

  const show = async (view: "/" | "/users", target = container) => {
    await act(() => {
      const definition = client.slots.panel?.[view];

      if (!(definition !== undefined && definition !== false)) {
        throw new Error("Missing view");
      }

      // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
      client.$runtime.render(
        /* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below. */
        h(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This controlled fixture supplies only the platform members exercised by the test, or deliberately invalid input for runtime validation.
          definition.component as ComponentType<{
            context: { userId: string; workspaceId: string };
            status: "ready";
            view: string;
          }>,
          {
            context: { userId: "u1", workspaceId: "w1" },
            status: "ready",
            view,
          }
        ) as VNode,
        /* oxlint-enable typescript/no-unsafe-type-assertion */
        target
      );
    });
  };

  try {
    await show("/");
    await act(() => container.querySelector("button")?.click());
    await show("/users");
    expect(container.textContent).toBe("count:1users");
    expect(
      mounts.mock.calls
        .map(([name]) => name)
        .toSorted((left, right) => Number(left > right) - Number(left < right))
    ).toEqual(["layout", "root", "slot"]);
    expect(cleanup).not.toHaveBeenCalled();
    await show("/users", other);
    expect(other.textContent).toBe("count:0users");
    await act(() => {
      client.$runtime.render(null, container);
    });
    expect(
      cleanup.mock.calls
        .map(([name]) => name)
        .toSorted((left, right) => Number(left > right) - Number(left < right))
    ).toEqual(["layout", "root", "slot"]);
  } finally {
    await act(() => {
      render(null, container);
      render(null, other);
    });
  }
});

it("matches layout prefixes at route boundaries", async () => {
  const view = defineView({
    component: () => h("div", {}, "leaf", h(Route, {})),
    slot: "panel",
    view: "/users",
  });

  const client = createFileClient({
    layouts: [
      {
        definition: ({ children }: ShellProps) =>
          h("div", {}, "users:", children),
        filename: "users.layout.tsx",
        path: "/users",
        slot: "panel",
      },
      {
        definition: ({ children }: ShellProps) =>
          h("div", {}, "all:", children),
        filename: "layout.tsx",
        path: "/",
        slot: "panel",
      },
      {
        definition: () => "wrong",
        filename: "user.layout.tsx",
        path: "/user",
        slot: "panel",
      },
    ],
    roots: [],
    views: [
      {
        definition: view,
        filename: "users.view.tsx",
        path: "/users",
        slot: "panel",
      },
    ],
  });

  const container = document.createElement("div");

  try {
    const definition = client.slots.panel?.["/users"];

    if (!(definition !== undefined && definition !== false)) {
      throw new Error("Missing view");
    }

    // SAFETY: The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below.
    await act(() => {
      client.$runtime.render(
        // SAFETY: This fixture controls the asserted value and verifies the runtime boundary below.
        /* oxlint-disable typescript/no-unsafe-type-assertion -- The fixture controls this value; this assertion bridges the minimal test double to the API whose behavior is asserted below. */
        h(definition.component, {
          context: { userId: "u1", workspaceId: "w1" },
          status: "ready",
          view: "/users",
        }) as VNode,
        /* oxlint-enable typescript/no-unsafe-type-assertion */
        container
      );
    });
    expect(container.textContent).toBe("all:users:leaf");
  } finally {
    await act(() => {
      client.$runtime.render(null, container);
    });
  }
});

it("rejects duplicate paths, invalid root exports, and mismatched file locations", () => {
  const view = defineView({ component: () => null, slot: "panel", view: "/" });

  const module = {
    definition: view,
    filename: "index.view.tsx",
    path: "/",
    slot: "panel",
  };

  const options = { layouts: [], roots: [], views: [module] };
  expect(() =>
    createFileClient({
      ...options,
      views: [...options.views, ...options.views],
    })
  ).toThrow("Duplicate view");
  expect(() =>
    createFileClient({
      ...options,
      root: { definition: () => null, filename: "root.tsx" },
    })
  ).toThrow("defineRoute");
  expect(() =>
    createFileClient({ ...options, views: [{ ...module, slot: "navbar" }] })
  ).toThrow('declares slot "panel"');
  expect(() =>
    createFileClient({ ...options, views: [{ ...module, path: "/other" }] })
  ).toThrow('declares view "/" but its file location requires "/other"');
  expect(() =>
    createFileClient({
      ...options,
      views: [{ ...module, definition: () => null }],
    })
  ).toThrow("defineView");
});
