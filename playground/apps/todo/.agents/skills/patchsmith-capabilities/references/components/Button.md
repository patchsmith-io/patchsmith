# Button
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import from `#patchsmith`. Accepts children between JSX tags.
Exact contract: `ButtonProps` in `#patchsmith` ([source](../../../../../src/patchsmith.gen.ts)).

## Props

| Prop | Required | Accepted values |
| --- | --- | --- |
| disabled | no | boolean |
| size | no | "default", "sm", "lg", "icon", "icon-sm" |
| variant | no | "default", "secondary", "ghost", "outline", "destructive" |

## Callbacks

Callbacks receive the serialized payload below, not a DOM event.

| Callback | Payload |
| --- | --- |
| onClick | no payload |

Use the listed props, callbacks, and styling values.

## Usage

Supply the required props listed above. Use supported children between tags.

```tsx
import { Button } from "#patchsmith";
import type { ButtonProps } from "#patchsmith";

export const Example = (props: ButtonProps) => (
  <Button {...props}>Example content</Button>
);
```
