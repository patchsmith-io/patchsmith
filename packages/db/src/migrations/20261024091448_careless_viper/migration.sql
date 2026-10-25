ALTER TABLE "app_deployment" DROP CONSTRAINT "app_deployment_logo_dark_file_id_app_deployment_file_id_fkey";--> statement-breakpoint
ALTER TABLE "app_deployment" DROP CONSTRAINT "app_deployment_logo_light_file_id_app_deployment_file_id_fkey";--> statement-breakpoint
ALTER TABLE "app_deployment" DROP COLUMN "logo_dark_file_id";--> statement-breakpoint
ALTER TABLE "app_deployment" DROP COLUMN "logo_light_file_id";