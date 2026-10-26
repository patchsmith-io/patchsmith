# experimental_Canvas
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import from `#patchsmith`. Does not accept children.
Exact contract: `experimental_CanvasProps` in `#patchsmith` ([source](../../../../../src/patchsmith.gen.ts)).

## Props

| Prop | Required | Accepted values |
| --- | --- | --- |
| ariaLabel | yes | string |
| height | yes | integer (minimum: 1; maximum: 4096) |
| surface | yes | string |
| width | yes | integer (minimum: 1; maximum: 4096) |

## Callbacks

Callbacks receive the serialized payload below, not a DOM event.

| Callback | Payload |
| --- | --- |
| — | No declared callbacks. |

Use the listed props, callbacks, and styling values.

## Usage

Supply the required props listed above. This component does not accept children.

```tsx
import { experimental_Canvas as Component } from "#patchsmith";
import type { experimental_CanvasProps } from "#patchsmith";

export const Example = (props: experimental_CanvasProps) => (
  <Component {...props} />
);
```
