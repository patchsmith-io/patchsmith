# A simple save form

This example needs `api.todos.add({ title })` and generated controls with the shown props, including disabled inputs/buttons. Use the product's supported accessible labels. Local state owns the field; the mutation hook owns pending/error state.

<!-- example: components/todo-editor.tsx -->

```tsx
import { useMutation } from "patchsmith/client";
import { useState } from "preact/hooks";

import { api, Box, Button, Input } from "#patchsmith";

export const TodoEditor = () => {
  const [title, setTitle] = useState("");
  const add = useMutation(api.todos.add, {
    onSuccess: () => setTitle(""),
  });

  return (
    <Box>
      <Input
        value={title}
        disabled={add.isPending}
        onValueChange={({ value }) => setTitle(value)}
      />
      <Button
        disabled={add.isPending || title.trim() === ""}
        onClick={() => add.mutate({ title })}
      >
        {add.isPending ? "Saving…" : "Add todo"}
      </Button>
      {add.isError ? <Box>Could not save. Try again.</Box> : null}
    </Box>
  );
};
```
