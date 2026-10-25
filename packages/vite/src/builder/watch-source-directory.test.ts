import { watch } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vite-plus/test";

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
      subscriptions.push({ directory, recursive: options.recursive });

      return watch(directory, options, listener);
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
