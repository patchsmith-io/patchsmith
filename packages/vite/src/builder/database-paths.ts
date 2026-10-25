import path from "node:path";

import { resolveAppSourceRoot } from "#source-root";

export const appDatabasePaths = (root: string, migrations?: string) => {
  const source = resolveAppSourceRoot(root);

  return {
    migrations:
      migrations === undefined
        ? path.join(source, "db/migrations")
        : path.resolve(root, migrations),
    schema: path.join(source, "db/schema.ts"),
  };
};
