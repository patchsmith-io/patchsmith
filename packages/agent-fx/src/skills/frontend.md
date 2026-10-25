# Frontend components

App frontend code runs in a hidden, sandboxed iframe. Patchsmith serializes the component tree and props, then renders the visible UI using the host's components.

Import UI components and host tools from `#patchsmith`. The generated capability pages list each control's props, callbacks, children, and styling options. Compose those controls with Preact; use their layout, spacing, color, and accessibility props.

When the user hasn't specified a style and you're unsure about details such as button size or text color, use the host components' defaults. Focus on the simplest design that solves the user's problem.

## Choosing controls and loading options

Choose controls from the host's declared capabilities to match the interaction. For predefined options that users need to search, prefer an available searchable picker, such as a Combobox, over composing separate search and selection controls. A short fixed list may suit an ordinary Select; free-form entry needs a control that supports it. Follow explicit user requirements and the host's documented behavior rather than assuming a particular component name or API exists.

Choose local or remote filtering based on option-set completeness, size, fetch cost, latency, and freshness requirements. If the complete list is small and economical to load, load it when needed and let the host control filter locally where supported. Reuse results and refresh them when relevant data changes. When loading the full list is impractical or cannot meet freshness requirements, use remote filtering, pagination, or reactive data through the available APIs and callbacks. Do not treat the first page as a complete list, or assume a local-only picker can perform remote search. Preserve valid selections across result refreshes and pagination.

Keep controls and surrounding content stable during asynchronous work. Prefer built-in pending, empty, and error states when available; otherwise provide feedback near the affected control without repeatedly resizing the surrounding content. Distinguish initial loading, background refresh, successful empty results, and failures. Retain usable results during refresh when appropriate, and show no-results feedback only after a successful load.

## Forms and callbacks

Host callbacks send serialized payloads back to the app's Preact code in the iframe; UI updates travel back to the host. This messaging is asynchronous and adds latency, even with synchronous handlers.

Prefer uncontrolled inputs when the host supports them, so typing doesn't wait for sandbox updates. Store values needed only on submit in `useRef`; use state when a value affects rendered UI. Controlled inputs remain useful when required by the host or feature.

Callbacks receive the payload in the generated signature: an object such as `{ value }`, a string, or no argument. Use that value directly; callbacks are not DOM events.

Backend hooks come from `patchsmith/client`; function references come from `api` in `#patchsmith`. They require `ClientProvider` above the component. See `patchsmith-functions` for queries, mutations, and actions.

Use the hook's pending/error state, disable overlapping saves, and keep drafts on failure.

This uncontrolled input keeps its draft on failure and remounts empty after a successful save. It assumes the host supports omitting `value`, `onValueChange({ value })`, and `onClick()`; use the host's declared props and accessible labels:

<!-- example: src/components/note-editor.tsx -->

```tsx
import { useMutation } from "patchsmith/client";
import { useRef, useState } from "preact/hooks";

import { api, Box, Button, Input } from "#patchsmith";

export const NoteEditor = () => {
  const title = useRef("");
  const [resetKey, setResetKey] = useState(0);
  const save = useMutation(api.notes.add, {
    onSuccess: () => {
      title.current = "";
      setResetKey((key) => key + 1);
    },
  });
  return (
    <Box>
      <Input
        key={resetKey}
        disabled={save.isPending}
        onValueChange={({ value }) => {
          title.current = value;
        }}
      />
      <Button
        disabled={save.isPending}
        onClick={() => {
          if (title.current.trim()) {
            save.mutate({ title: title.current });
          }
        }}
      >
        {save.isPending ? "Saving…" : "Add note"}
      </Button>
      {save.isError ? <Box>Could not save. Try again.</Box> : null}
    </Box>
  );
};
```

## Host tools

Host tools perform exposed product operations, such as updating a contact or navigating. Call `tools` from `#patchsmith` in an event handler or effect and handle the promise's result/error. Tools return one result per call; they do not subscribe to changes.
