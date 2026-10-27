# Icon
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import from `#patchsmith`. Does not accept children.
Exact contract: `IconProps` in `#patchsmith` ([source](../../../../../src/patchsmith.gen.ts)).

## Props

| Prop | Required | Accepted values |
| --- | --- | --- |
| name | yes | string |
| size | no | number (minimum: 1; maximum: 256) |

## Callbacks

Callbacks receive the serialized payload below, not a DOM event.

| Callback | Payload |
| --- | --- |
| — | No declared callbacks. |

Use the listed props, callbacks, and styling values.

## Usage

Supply the required props listed above. This component does not accept children.

```tsx
import { Icon } from "#patchsmith";
import type { IconProps } from "#patchsmith";

export const Example = (props: IconProps) => (
  <Icon {...props} />
);
```
