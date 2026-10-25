---
"@patchsmith/vite": patch
---

Start each new app build with an empty output directory, and remove obsolete static assets during watch rebuilds. Rebuild the upload manifest from current app assets instead of validating a stale manifest during the server build. Apps upgraded from the previous logo format can deploy without manually deleting generated files. Reject output directories that overlap app sources, dependencies, migration sources, or app configuration, or traverse symlinks.
