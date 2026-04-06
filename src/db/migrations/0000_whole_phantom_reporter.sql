CREATE TYPE "public"."media_type" AS ENUM('photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."tag_category" AS ENUM('person', 'location', 'event', 'year', 'activity', 'other');--> statement-breakpoint
CREATE TABLE "album_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(500) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"parent_id" uuid,
	"s3_prefix" text NOT NULL,
	"cover_media_id" uuid,
	"sort_order" integer DEFAULT 0,
	"media_count" integer DEFAULT 0,
	"date_start" timestamp,
	"date_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "albums_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "email_whitelist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_whitelist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"type" "media_type" NOT NULL,
	"s3_key" text NOT NULL,
	"thumbnail_s3_key" text,
	"small_s3_key" text,
	"filename" varchar(1000) NOT NULL,
	"title" varchar(1000),
	"mime_type" varchar(100),
	"file_size" integer,
	"width" integer,
	"height" integer,
	"duration" integer,
	"date_taken" timestamp,
	"sort_order" integer DEFAULT 0,
	"search_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "media_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"category" "tag_category" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_tags" ADD CONSTRAINT "album_tags_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_tags" ADD CONSTRAINT "album_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "album_tags_unique_idx" ON "album_tags" USING btree ("album_id","tag_id");--> statement-breakpoint
CREATE INDEX "albums_parent_id_idx" ON "albums" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "albums_slug_idx" ON "albums" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "media_album_id_idx" ON "media" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "media_type_idx" ON "media" USING btree ("type");--> statement-breakpoint
CREATE INDEX "media_date_taken_idx" ON "media" USING btree ("date_taken");--> statement-breakpoint
CREATE INDEX "media_search_gin_idx" ON "media" USING gin (to_tsvector('english', coalesce("search_text", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "media_tags_unique_idx" ON "media_tags" USING btree ("media_id","tag_id");--> statement-breakpoint
CREATE INDEX "media_tags_tag_id_idx" ON "media_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "media_tags_media_id_idx" ON "media_tags" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_category_idx" ON "tags" USING btree ("slug","category");