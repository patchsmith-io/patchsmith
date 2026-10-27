# Scoped app slug rollout

Ship this change in three separate PRs, in this order. Do not squash the database stages together: the migration workflow runs all migrations on `main` before deploying consumers.

1. **Database expansion:** add `app.is_shared` with a database default of `true`, plus the shared and local partial unique indexes. Retain `app_project_id_slug_unique`. Existing rows and old-server inserts keep their shared names. The existing unique index guarantees that the new indexes can be built without duplicate data. Index creation takes locks; use the normal migration window.
2. **Backend and SDK:** deploy namespace-aware selectors, explicit conflict handling without an index target, local creation defaults, and host prefix formatting. Until the final stage, the legacy index still prevents equal slugs in different scopes. A concurrent insert rejected by that index returns a conflict. This backend is the rollback baseline for the final stage.
3. **Database contraction:** after all previous backend instances have retired, remove `app_project_id_slug_unique` and change the database default for `app.is_shared` to `false`. Existing rows retain their shared names; future inserts that omit the flag become local. Shared apps must explicitly set `isShared: true`. The two partial indexes now allow equal local names in different scopes and shared/local names to coexist. Do not roll back to a backend that uses the removed index as an `ON CONFLICT` target or looks up slugs without their namespace.

The database keeps the unprefixed slug and exact canonical scope identity. Local prefix configuration belongs to each host and is never written into scope JSON. A prefix change changes presented URLs; hosts that promise old URL compatibility must handle redirects themselves.

`isShared` reserves a project-wide name. It does not publish an app or grant access to another scope. Existing scope authorization remains in effect for shared apps too. Agent-built apps are local. Installations default to local and retain the source slug unless the host supplies another one.

The platform API returns raw slugs with `isShared`. Slug selectors default to the shared namespace; local selectors explicitly set `isShared: false` and require authorized scopes. Multiple matching local installations return `CONFLICT`. Cross-scope installation by local slug additionally requires an explicit `sourceScope`; IDs remain unambiguous.

Run migrations against disposable test databases only during development. Production migrations remain owned by `.github/workflows/db-migrate.yml`.
