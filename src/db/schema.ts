import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────

export const mediaTypeEnum = pgEnum("media_type", ["photo", "video"]);
export const tagCategoryEnum = pgEnum("tag_category", [
  "person",
  "location",
  "event",
  "year",
  "activity",
  "other",
]);

// ─── Auth Whitelist ──────────────────────────────────────

export const emailWhitelist = pgTable("email_whitelist", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── User Profiles ───────────────────────────────────────

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // matches auth.users.id
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Albums ──────────────────────────────────────────────

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 500 }).notNull().unique(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    s3Prefix: text("s3_prefix").notNull(),
    coverMediaId: uuid("cover_media_id"),
    sortOrder: integer("sort_order").default(0),
    mediaCount: integer("media_count").default(0),
    dateStart: timestamp("date_start"),
    dateEnd: timestamp("date_end"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("albums_parent_id_idx").on(table.parentId),
    index("albums_slug_idx").on(table.slug),
  ]
);

// ─── Media Items ─────────────────────────────────────────

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id")
      .references(() => albums.id)
      .notNull(),
    type: mediaTypeEnum("type").notNull(),
    s3Key: text("s3_key").notNull().unique(),
    thumbnailS3Key: text("thumbnail_s3_key"),
    smallS3Key: text("small_s3_key"),
    filename: varchar("filename", { length: 1000 }).notNull(),
    title: varchar("title", { length: 1000 }),
    mimeType: varchar("mime_type", { length: 100 }),
    fileSize: integer("file_size"), // bigint in DB for files > 2GB
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    dateTaken: timestamp("date_taken"),
    sortOrder: integer("sort_order").default(0),
    thumbnailFrames: text("thumbnail_frames"), // JSON array of S3 keys for video preview frames
    searchText: text("search_text"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("media_album_id_idx").on(table.albumId),
    index("media_type_idx").on(table.type),
    index("media_date_taken_idx").on(table.dateTaken),
    index("media_search_gin_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.searchText}, ''))`
    ),
  ]
);

// ─── Tags ────────────────────────────────────────────────

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    category: tagCategoryEnum("category").notNull(),
  },
  (table) => [
    uniqueIndex("tags_slug_category_idx").on(table.slug, table.category),
  ]
);

// ─── Media-Tags Join ─────────────────────────────────────

export const mediaTags = pgTable(
  "media_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaId: uuid("media_id")
      .references(() => media.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    uniqueIndex("media_tags_unique_idx").on(table.mediaId, table.tagId),
    index("media_tags_tag_id_idx").on(table.tagId),
    index("media_tags_media_id_idx").on(table.mediaId),
  ]
);

// ─── Album-Tags Join ─────────────────────────────────────

export const albumTags = pgTable(
  "album_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    albumId: uuid("album_id")
      .references(() => albums.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    uniqueIndex("album_tags_unique_idx").on(table.albumId, table.tagId),
  ]
);

// ─── Clips ───────────────────────────────────────────────

export const clips = pgTable(
  "clips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaId: uuid("media_id")
      .references(() => media.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    startTime: integer("start_time").notNull(), // stored as seconds (float in DB)
    endTime: integer("end_time").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("clips_media_id_idx").on(table.mediaId),
    index("clips_created_by_idx").on(table.createdBy),
  ]
);

export const clipTags = pgTable(
  "clip_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clipId: uuid("clip_id")
      .references(() => clips.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    uniqueIndex("clip_tags_unique").on(table.clipId, table.tagId),
    index("clip_tags_clip_id_idx").on(table.clipId),
  ]
);

// ─── Favorites ───────────────────────────────────────────

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    mediaId: uuid("media_id")
      .references(() => media.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("favorites_unique").on(table.userId, table.mediaId),
    index("favorites_user_id_idx").on(table.userId),
    index("favorites_media_id_idx").on(table.mediaId),
  ]
);
