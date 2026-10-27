import { defineContract } from "./contract";
import { hook } from "./hooks";
import type { ContractHooks } from "./hooks";
import { createPatchsmithSchema } from "./schema";

// Hosts can declare ordinary hooks, including names that merely contain patchsmith.
defineContract({
  hooks: { "customers.patchsmith": hook(), patchsmithSync: hook() },
});

defineContract({
  hooks: {
    // @ts-expect-error Built-in hooks cannot be redefined by hosts.
    "patchsmith.onInstall": hook(),
  },
});

defineContract({
  hooks: {
    // @ts-expect-error Hosts cannot invent hooks in the platform namespace.
    "patchsmith.custom": hook(),
  },
});

defineContract({
  hooks: {
    // @ts-expect-error The namespace root is also reserved.
    patchsmith: hook(),
  },
});

const reserved = { "patchsmith.nested.custom": hook() };

defineContract({
  // @ts-expect-error Reservation also applies to hook maps passed through variables.
  hooks: reserved,
});

const declared: ContractHooks = {
  // @ts-expect-error Explicitly typed hook maps cannot declare platform hooks.
  "patchsmith.custom": hook(),
};

void declared;

createPatchsmithSchema({
  components: {},
  hooks: {
    // @ts-expect-error Low-level schemas must respect the same reserved namespace.
    "patchsmith.custom": hook(),
  },
});
