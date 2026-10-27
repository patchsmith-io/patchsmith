---
"@patchsmith/vite": patch
"@patchsmith/cli": patch
---

Add the experimental `$internal.isShared` app configuration option for reserving a project-wide slug. Deployment forwards the flag when creating an app and synchronizes explicitly configured changes before publication. Omitting it preserves an existing app's setting; new apps default to local names. Host authorization and installation eligibility remain separate from this naming flag.
