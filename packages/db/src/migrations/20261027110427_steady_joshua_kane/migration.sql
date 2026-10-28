ALTER TABLE "app" ADD COLUMN "is_shared" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "app_project_shared_slug_unique" ON "app" ("project_id","slug") WHERE "is_shared" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "app_project_scope_slug_unique" ON "app" ("project_id","scope_key","slug") WHERE "is_shared" = false;