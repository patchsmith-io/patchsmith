# Input
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import from `#patchsmith`. Does not accept children.
Exact contract: `InputProps` in `#patchsmith` ([source](../../../../../src/patchsmith.gen.ts)).

## Props

| Prop | Required | Accepted values |
| --- | --- | --- |
| placeholder | no | string |
| value | yes | string |

## Callbacks

Callbacks receive the serialized payload below, not a DOM event.

| Callback | Payload |
| --- | --- |
| onValueChange | { value (required): string } |

Use the listed props, callbacks, and styling values.

## Usage

Supply the required props listed above. This component does not accept children.

```tsx
import { Input } from "#patchsmith";
import type { InputProps } from "#patchsmith";

export const Example = (props: InputProps) => (
  <Input {...props} />
);
```

### Local value and callback

Keep the field value in component state and use the declared callback payload.

```tsx
import { useState } from "preact/hooks";
import { Input } from "#patchsmith";
import type { InputProps } from "#patchsmith";

export const ValueExample = (props: InputProps) => {
  const [value, setValue] = useState(props.value ?? "");
  return <Input {...props} value={value} onValueChange={({ value }) => setValue(value)} />;
};
```
