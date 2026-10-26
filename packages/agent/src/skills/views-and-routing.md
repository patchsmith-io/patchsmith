# Views and routing

Choose the supported slot/path from generated capabilities. A normal list or panel needs one view; use repeated instances only when the product surface requires them.

- Views live in `slots/<slot>/**/*.view.tsx` and default-export `defineView({ view, component })` from `patchsmith/client`. Import `#patchsmith` for type augmentation. The directory infers the slot; an explicit `slot` must agree.
- `members.detail.view.tsx` and `members/detail.view.tsx` map to `/members/detail`; a final `index` maps to its parent. The declared path must match the file and contract. Each slot/path pair is unique.
- Paths describe product context, not browser routes. The product selects the deepest matching view, falling back to ancestors. Read context with the definition's `useContext()` inside that view's tree; ancestor shells do not have its context.
- App/slot `root.tsx` exports `defineRoute({ shellComponent: Shell })`. Render `<Route />` to continue to the selected view and retain `ClientProvider` above backend hooks. Add `layout.tsx` or `members.layout.tsx` only for shared UI needed by those views.

## Repeated instances

Read the generated views page for a schema-specific registration example. For `multiple: true`, provide inline `instances: { dataSchema, resolve: (...) => ... }` on a module-level `defineView` with a literal path. Single-instance slots omit it.

The build extracts the resolver into the backend. It receives `{ context, identity, signal, queries }` and may await registered queries, not mutations/actions. Keep dependencies backend-safe and access checks in the queries. Return stable unique keys, supported metadata, and schema-valid data. Read instance data with `useInstance()` inside the view.

Instance discovery is separate from query subscriptions. Check the product's refresh behavior when collection changes are part of the feature.
