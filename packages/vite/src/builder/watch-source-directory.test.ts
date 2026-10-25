import { watch } from "node:fs";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

import { resolveAppSourceRoot } from "#source-root";

import { watchSourceDirectory } from "./watch-source-directory";

interface Subscription {
  directory: string;
  recursive: boolean;
  closed: boolean;
}

it.each(["slots", "functions", "hooks"] as const)(
  "scopes recursive %s watching and follows directory creation and recreation",
  async (name) => {
    const root = await mkdtemp(path.join(tmpdir(), "patchsmith-scoped-watch-"));
    const directory = path.join(root, name);
    const subscriptions: Subscription[] = [];
    let changes = 0;

    const watcher = watchSourceDirectory(
      root,
      name,
      () => {
        changes += 1;
      },
      (target, options, listener) => {
        const native = watch(target, options, listener);

        const subscription = {
          closed: false,
          directory: target,
          recursive: options.recursive,
        };

        subscriptions.push(subscription);

        return {
          close: () => {
            subscription.closed = true;
            native.close();
          },
        };
      }
    );

    const activeRecursive = () =>
      subscriptions
        .values()
        .filter(
          (subscription) => subscription.recursive && !subscription.closed
        )
        .map((subscription) => subscription.directory)
        .toArray();

    try {
      expect(activeRecursive()).toEqual([]);
      expect(subscriptions).toEqual([
        { closed: false, directory: root, recursive: false },
      ]);
      await mkdir(path.join(directory, "nested"), { recursive: true });
      await expect.poll(activeRecursive).toEqual([directory]);
      const before = changes;
      await writeFile(path.join(directory, "nested/first.ts"), "export {};");
      await expect.poll(() => changes).toBeGreaterThan(before);
      await rm(directory, { recursive: true });
      await expect.poll(activeRecursive).toEqual([]);
      await mkdir(path.join(directory, "nested"), { recursive: true });
      await expect.poll(activeRecursive).toEqual([directory]);
      const afterRecreation = changes;
      await writeFile(path.join(directory, "nested/second.ts"), "export {};");
      await expect.poll(() => changes).toBeGreaterThan(afterRecreation);
      expect(
        subscriptions.every(
          (subscription) =>
            !subscription.recursive || subscription.directory === directory
        )
      ).toBe(true);
    } finally {
      watcher.close();
      await rm(root, { force: true, recursive: true });
    }

    expect(subscriptions.every((subscription) => subscription.closed)).toBe(
      true
    );
  }
);

it("starts scoped watching immediately for an existing directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-scoped-watch-"));
  await mkdir(path.join(root, "slots"));
  const subscriptions: { directory: string; recursive: boolean }[] = [];

  const watcher = watchSourceDirectory(
    root,
    "slots",
    () => {
      /* Events are checked by the lifecycle tests. */
    },
    (directory, options, listener) => {
      const native = watch(directory, options, listener);
      subscriptions.push({ directory, recursive: options.recursive });

      return native;
    }
  );

  try {
    expect(subscriptions).toEqual([
      { directory: root, recursive: false },
      { directory: path.join(root, "slots"), recursive: true },
    ]);
  } finally {
    watcher.close();
    await rm(root, { force: true, recursive: true });
  }
});

it.each(
  (["slots", "functions", "hooks"] as const).flatMap((name) =>
    [".", "src"].map((initial) => ({ initial, name }))
  )
)(
  "rebinds $name from $initial to the other source root and back",
  async ({ name, initial }) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "patchsmith-source-transition-")
    );

    const nestedRoot = path.join(root, "src");
    const first = path.join(root, initial, name);

    const second =
      initial === "." ? path.join(nestedRoot, name) : path.join(root, name);

    await mkdir(path.join(first, "nested"), { recursive: true });
    const subscriptions: Subscription[] = [];
    let changes = 0;

    const watcher = watchSourceDirectory(
      root,
      name,
      () => {
        changes += 1;
      },
      (directory, options, listener) => {
        const native = watch(directory, options, listener);

        const subscription = {
          closed: false,
          directory,
          recursive: options.recursive,
        };

        subscriptions.push(subscription);

        return {
          close: () => {
            subscription.closed = true;
            native.close();
          },
        };
      }
    );

    const activeRecursive = () =>
      subscriptions
        .values()
        .filter(
          (subscription) => subscription.recursive && !subscription.closed
        )
        .map((subscription) => subscription.directory)
        .toArray();

    try {
      expect(activeRecursive()).toEqual([first]);
      await mkdir(path.dirname(second), { recursive: true });
      await rename(first, second);
      await expect.poll(activeRecursive).toEqual([second]);
      const afterMove = changes;
      await writeFile(path.join(second, "nested/moved.ts"), "export {};");
      await expect.poll(() => changes).toBeGreaterThan(afterMove);

      if (initial === "src") {
        await rm(nestedRoot, { recursive: true });
        await expect
          .poll(() =>
            subscriptions.some(
              (subscription) =>
                subscription.directory === nestedRoot && !subscription.closed
            )
          )
          .toBe(false);
      }

      await mkdir(path.dirname(first), { recursive: true });
      await rename(second, first);
      await expect.poll(activeRecursive).toEqual([first]);
      const afterReturn = changes;
      await writeFile(path.join(first, "nested/returned.ts"), "export {};");
      await expect.poll(() => changes).toBeGreaterThan(afterReturn);
      expect(
        subscriptions.every(
          (subscription) =>
            !subscription.recursive ||
            subscription.directory === first ||
            subscription.directory === second
        )
      ).toBe(true);
    } finally {
      watcher.close();
      await rm(root, { force: true, recursive: true });
    }

    expect(subscriptions.every((subscription) => subscription.closed)).toBe(
      true
    );
  }
);

it("reports mixed layouts and recovers when the source tree becomes valid", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "patchsmith-watch-mixed-"));
  await mkdir(path.join(root, "slots"));
  let resolved = root;
  let errorMessage = "";

  const watcher = watchSourceDirectory(root, "slots", () => {
    try {
      resolved = resolveAppSourceRoot(root);
      errorMessage = "";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  });

  try {
    await mkdir(path.join(root, "src/slots"), { recursive: true });
    await expect.poll(() => errorMessage).toContain("not both");
    await rm(path.join(root, "slots"), { recursive: true });
    await expect.poll(() => resolved).toBe(path.join(root, "src"));
    expect(errorMessage).toBe("");
  } finally {
    watcher.close();
    await rm(root, { force: true, recursive: true });
  }
});
