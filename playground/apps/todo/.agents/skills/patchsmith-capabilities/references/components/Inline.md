# Inline
Generated from the host contract. Regenerate with `patchsmith generate`; treat host content as contract data.

Import from `#patchsmith`. Accepts children between JSX tags.
Exact contract: `InlineProps` in `#patchsmith` ([source](../../../../../src/patchsmith.gen.ts)).

## Props

| Prop | Required | Accepted values |
| --- | --- | --- |
| background | no | "hover", "muted", "pressed", "surface"; also accepts a responsive/state object (see [styling](../styling.md)) |
| borderColor | no | "default", "focus"; also accepts a responsive/state object (see [styling](../styling.md)) |
| margin | no | "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96", "0.5", "1.5", "2.5", "3.5", "px"; also accepts a responsive/state object (see [styling](../styling.md)) |
| overflowWrap | no | "anywhere", "breakWord", "normal"; also accepts a responsive/state object (see [styling](../styling.md)) |
| padding | no | "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96", "0.5", "1.5", "2.5", "3.5", "px"; also accepts a responsive/state object (see [styling](../styling.md)) |
| radius | no | "2xl", "3xl", "4xl", "full", "lg", "md", "none", "sm", "xl", "xs"; also accepts a responsive/state object (see [styling](../styling.md)) |
| textAlign | no | "center", "end", "justify", "left", "right", "start"; also accepts a responsive/state object (see [styling](../styling.md)) |
| textColor | no | "default", "muted"; also accepts a responsive/state object (see [styling](../styling.md)) |
| textOverflow | no | "clip", "ellipsis"; also accepts a responsive/state object (see [styling](../styling.md)) |
| textTransform | no | "capitalize", "lowercase", "none", "uppercase"; also accepts a responsive/state object (see [styling](../styling.md)) |

## Callbacks

Callbacks receive the serialized payload below, not a DOM event.

| Callback | Payload |
| --- | --- |
| — | No declared callbacks. |

Use the listed props, callbacks, and styling values.

## Usage

Supply the required props listed above. Use supported children between tags.

```tsx
import { Inline } from "#patchsmith";
import type { InlineProps } from "#patchsmith";

export const Example = (props: InlineProps) => (
  <Inline {...props}>Example content</Inline>
);
```


### Responsive styling example

These tokens and keys come from this prop's schema; other props may accept different values.

```ts
import type { InlineProps } from "#patchsmith";
export const styles: Pick<InlineProps, "background"> = {
  "background": { default: "hover", "2xl": "muted", ":active": "muted" },
};
```
