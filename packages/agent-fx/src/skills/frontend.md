# Frontend components

App frontend code runs in a hidden, sandboxed iframe. Patchsmith serializes the component tree and props, then renders the visible UI using the host's components.

Import UI components and host tools from `#patchsmith`. The generated capability pages list each control's props, callbacks, children, and styling options. Compose those controls with Preact; use their layout, spacing, color, and accessibility props.

## Interface design

Build the smallest usable interface on the first pass. Use the host components' default sizing, spacing, and colors unless the user requests a different style.

- Begin with the controls, actions, and data needed for the requested workflow. A small utility often needs only one group of controls. Add a title only when the surrounding host doesn't already identify the task; add sections or cards only for distinct groups that need them.
- Default to zero supporting sentences. Make field labels and action names self-explanatory. Omit subtitles, introductions, per-section descriptions, reassurance, and explanations of ordinary controls. A simple screen should usually need no body copy; if a label cannot resolve a necessary ambiguity, use one short sentence beside the control.
- Show only the current state that affects what the person can do. Prefer the control's value, enabled state, or button label to a separate status block. Replace pending feedback with its result and clear stale feedback. A successful action usually needs only the updated control or data; avoid accumulating success messages, status summaries, and history.
- Expose data because the person needs it for their task. Internal state, diagnostic fields, and timestamps do not become interface requirements just because the implementation tracks them. Add logs, activity history, or technical configuration only when requested or essential to the workflow.
- Use everyday language that tells the person what to do next. Keep implementation mechanics and operational explanations in the conversation. Optional help is a feature to add when needed, not a place to relocate surplus prose. Keep a material consequence or blocking limitation visible in one brief, actionable message; accurately reflect uncertainty without explaining the underlying machinery.
- Preserve associated labels, accessible names, keyboard interaction, and supported status announcements. Essential input guidance and error recovery may need concise text connected to the control. Accessibility does not require routine helper paragraphs; placeholders and tooltips do not replace labels.

Before finishing the first implementation, read every visible string as an end user. Remove anything that neither names necessary task data or a control nor resolves an immediate usability problem. Then remove redundant headings, badges, dividers, and containers. Judge the total amount of text on the screen, even when each individual sentence seems defensible.

Review the available components and their documented capabilities before building an interaction. Choose the component that best fits the user's task. Prefer one component that handles the interaction well over combining several controls when it makes the UI simpler and preserves the required behavior and accessibility.

## Forms and callbacks

Host callbacks send serialized payloads back to the app's Preact code in the iframe; UI updates travel back to the host. This messaging is asynchronous and adds latency, even with synchronous handlers.

Prefer uncontrolled inputs when the host supports them, so typing doesn't wait for sandbox updates. Store values needed only on submit in `useRef`; use state when a value affects rendered UI. Controlled inputs remain useful when required by the host or feature.

Callbacks receive the payload in the generated signature: an object such as `{ value }`, a string, or no argument. Use that value directly; callbacks are not DOM events.

Backend hooks come from `patchsmith/client`; function references come from `api` in `#patchsmith`. They require `ClientProvider` above the component. See `patchsmith-functions` for queries, mutations, and actions.

Use the hook's pending/error state, disable overlapping saves, and keep drafts on failure.

This uncontrolled input keeps its draft on failure and remounts empty after a successful save. It assumes the host supports omitting `value`, `onValueChange({ value })`, and `onClick()`; use the host's declared props and accessible labels:

<!-- example: components/note-editor.tsx -->

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
