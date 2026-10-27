---
"@patchsmith/app": minor
"@patchsmith/vite": minor
"@patchsmith/core": minor
"@patchsmith/client-platform": minor
"patchsmith": minor
---

Require `subjectId` when calling `patchsmith.experimental.installApp` and the platform install endpoint. Pass the authenticated user or service principal's stable identifier alongside `appId` and `scope`; the SDK validates and forwards it automatically. Upgrade the host SDK and generated platform client together with the backend.

Add the built-in `patchsmith.onInstall` lifecycle hook. Apps implement it with `defineHook` in `src/hooks/patchsmith/onInstall.hook.ts`; the platform invokes it after installation commits, using the installing subject and the host tool endpoint supplied by the SDK. Install calls wait up to 30 seconds for execution; hook failures are logged without undoing the installation, and delivery has no automatic retries.

Reserve `patchsmith` and `patchsmith.*` against host hook declarations with compile-time errors and runtime validation. App hook names, manifests, and deployment inputs accept only known platform hooks in that namespace. Lifecycle grants cannot be requested through the ordinary hook-session endpoint. Direct platform install callers must also supply `toolUrl`; the host SDK derives it from its configured base URL.
