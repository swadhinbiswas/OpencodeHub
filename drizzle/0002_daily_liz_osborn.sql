CREATE TABLE "oauth_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"redirect_uris" text NOT NULL,
	"scopes" text,
	"homepage_url" text,
	"icon_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_apps_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "oauth_authorization_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_app_id_oauth_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_apps_owner_idx" ON "oauth_apps" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "oauth_codes_app_idx" ON "oauth_authorization_codes" USING btree ("app_id");