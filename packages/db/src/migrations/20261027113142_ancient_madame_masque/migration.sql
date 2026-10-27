DROP INDEX "app_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "app" ALTER COLUMN "is_shared" SET DEFAULT false;