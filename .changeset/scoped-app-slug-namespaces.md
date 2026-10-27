---
"@patchsmith/core": minor
"@patchsmith/client-platform": minor
---

Separate shared project-wide app names from local installation names. New apps default to local; set `isShared: true` to reserve a project-wide name without changing visibility or access. Existing apps retain shared names and can be reclassified with `apps.update`.

Host app responses prefix local slugs with `@`, without changing stored slugs or scopes.

Host RPC `apps.get` accepts an explicit `slug` selector, and authenticated HTTP `GET /apps/lookup?slug=@stripe&scopes=org` resolves a slug using the host's verified scopes. Unprefixed names select shared apps. The lower-level platform API returns raw slugs and accepts `{ slug, isShared: false }` for local lookups. Local names matching multiple supplied scopes return `CONFLICT`; select one scope or use an ID. Shared names still require scope authorization.

Installations default to local names and inherit the source slug unless another slug is supplied. Installing a local source by slug requires `sourceScope`; source IDs remain unambiguous. Deploy the staged database changes before using duplicate local names.
