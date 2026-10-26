# Share state with props

A parent can own a filter and pass it to a list. This assumes generated `Input.value`, `onValueChange({ value })`, and `Box` children. Adapt controls and accessible labels to the product.

<!-- example: components/search-list.tsx -->

```tsx
import { useState } from "preact/hooks";

import { Box, Input } from "#patchsmith";

type Item = { id: string; title: string };

const Results = ({ items, search }: { items: Item[]; search: string }) => (
  <Box>
    {items
      .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
      .map((item) => (
        <Box key={item.id}>{item.title}</Box>
      ))}
  </Box>
);

export const SearchList = ({ items }: { items: Item[] }) => {
  const [search, setSearch] = useState("");
  return (
    <Box>
      <Input value={search} onValueChange={({ value }) => setSearch(value)} />
      <Results items={items} search={search} />
    </Box>
  );
};
```

This local filter fits a small list already loaded. Search on the backend when the collection needs it.
