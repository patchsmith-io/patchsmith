---
"@patchsmith/vite": minor
"@patchsmith/cli": minor
"patchsmith": minor
"@patchsmith/app": minor
---

Default new apps to root-level source and support an optional `src/` source tree with `patchsmith init --src-dir`. Views, functions, hooks, database paths, generated bindings, and watch builds use the same detected source root. Keep app source directories together; mixed root and `src/` layouts fail.

Move the shared frontend shell from `root.tsx` to `slots/root.tsx` (or from `src/root.tsx` to `src/slots/root.tsx`). This is a breaking change: move existing shells to the new location and run `patchsmith generate`. Configuration, environment files, assets, and explicit migration paths remain relative to the project root. Update package import aliases and TypeScript includes if moving an existing app out of `src/`.
