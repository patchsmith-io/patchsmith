---
"@patchsmith/client-platform": patch
---

Add typed `409 CONFLICT` responses for overlapping deployment publication requests. Repeated requests for a published deployment return its stored result without repeating rollout or warm-up.
