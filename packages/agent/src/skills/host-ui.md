# Build the UI

Read `.agents/skills/patchsmith-capabilities/SKILL.md` and the component/tool pages needed for the task. For older apps, search the relevant declarations in `patchsmith.gen.ts`. Import components, `api`, and tools from `#patchsmith`.

Compose generated controls directly with Preact. Use their layout, styling, children, and accessibility props. Callback values follow the generated signature: for `{ value }`, use `onValueChange={({ value }) => setTitle(value)}`. They are serialized values, not DOM events.

Keep field state in the component and use SDK hook pending/error state. The [form example](references/drafts.md) shows a normal save without a custom hook. Use supported disabled props during saves and show errors with available controls. Share state through props when needed.

Use `useQuery` for app data and `useMutation`/`useAction` for operations. Product tools are direct promise-returning calls; use them from callbacks or effects and handle the result/error. Backend product operations use action context `tools`. Navigation, toasts, and dialogs require exposed product capabilities too.

Use ordinary controlled inputs or the product's uncontrolled API as appropriate. Add performance or request coordination only for a concrete need. Verify the requested UI in the product when available.
