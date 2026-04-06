import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { media, mediaTags, tags } from "@/db/schema";
import { eq, and, inArray, sql, asc, desc } from "drizzle-orm";
import { generateSignedUrl } from "../services/s3";

async function enrichMediaWithUrls<T extends { thumbnailS3Key: string | null; smallS3Key: string | null; s3Key: string; thumbnailFrames: string | null; type: "photo" | "video" }>(items: T[]) {
  return Promise.all(
    items.map(async (item) => {
      const thumbnailKey = item.thumbnailS3Key || item.smallS3Key || item.s3Key;
      const thumbnailUrl = await generateSignedUrl(thumbnailKey);

      let thumbnailFrameUrls: string[] = [];
      if (item.type === "video" && item.thumbnailFrames) {
        try {
          const frames: string[] = JSON.parse(item.thumbnailFrames);
          if (frames.length > 0) {
            thumbnailFrameUrls = await Promise.all(
              frames.map((key) => generateSignedUrl(key))
            );
          }
        } catch {}
      }

      return { ...item, thumbnailUrl, thumbnailFrameUrls };
    })
  );
}

export const mediaRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        albumId: z.string().uuid().optional(),
        tagIds: z.array(z.string().uuid()).optional(),
        type: z.enum(["photo", "video"]).optional(),
        search: z.string().optional(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];

      if (input.albumId) {
        conditions.push(eq(media.albumId, input.albumId));
      }
      if (input.type) {
        conditions.push(eq(media.type, input.type));
      }
      if (input.search) {
        conditions.push(
          sql`to_tsvector('english', coalesce(${media.searchText}, '')) @@ plainto_tsquery('english', ${input.search})`
        );
      }

      // Cursor-based pagination: skip past the cursor item
      if (input.cursor) {
        const cursorItem = await ctx.db
          .select({ sortOrder: media.sortOrder, filename: media.filename })
          .from(media)
          .where(eq(media.id, input.cursor))
          .limit(1);

        if (cursorItem[0]) {
          conditions.push(
            sql`(${media.sortOrder} > ${cursorItem[0].sortOrder} OR (${media.sortOrder} = ${cursorItem[0].sortOrder} AND ${media.filename} > ${cursorItem[0].filename}))`
          );
        }
      }

      // If filtering by tags, join through media_tags
      if (input.tagIds && input.tagIds.length > 0) {
        const mediaIdsWithTags = ctx.db
          .selectDistinct({ mediaId: mediaTags.mediaId })
          .from(mediaTags)
          .where(inArray(mediaTags.tagId, input.tagIds));

        conditions.push(
          inArray(
            media.id,
            sql`(${mediaIdsWithTags})`
          )
        );
      }

      const items = await ctx.db
        .select()
        .from(media)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(media.sortOrder), asc(media.filename))
        .limit(input.limit + 1);
      const hasMore = items.length > input.limit;
      const result = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore ? result[result.length - 1]?.id : undefined;

      const itemsWithUrls = await enrichMediaWithUrls(result);

      return { items: itemsWithUrls, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db
        .select()
        .from(media)
        .where(eq(media.id, input.id))
        .limit(1);

      if (!item[0]) return null;

      const [fullUrl, thumbnailUrl] = await Promise.all([
        generateSignedUrl(item[0].s3Key),
        item[0].thumbnailS3Key
          ? generateSignedUrl(item[0].thumbnailS3Key)
          : null,
      ]);

      // Get tags for this media
      const itemTags = await ctx.db
        .select({ id: tags.id, name: tags.name, category: tags.category, slug: tags.slug })
        .from(mediaTags)
        .innerJoin(tags, eq(mediaTags.tagId, tags.id))
        .where(eq(mediaTags.mediaId, input.id));

      return { ...item[0], fullUrl, thumbnailUrl, tags: itemTags };
    }),

  getSignedUrls: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.string().uuid(),
            key: z.string(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      const urls = await Promise.all(
        input.items.map(async ({ id, key }) => ({
          id,
          url: await generateSignedUrl(key),
        }))
      );
      return Object.fromEntries(urls.map((u) => [u.id, u.url]));
    }),

  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(media)
        .where(
          sql`to_tsvector('english', coalesce(${media.searchText}, '')) @@ plainto_tsquery('english', ${input.query})`
        )
        .orderBy(
          sql`ts_rank(to_tsvector('english', coalesce(${media.searchText}, '')), plainto_tsquery('english', ${input.query})) DESC`
        )
        .limit(input.limit);

      const itemsWithUrls = await enrichMediaWithUrls(results);

      return itemsWithUrls;
    }),

  getAdjacent: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        albumId: z.string().uuid(),
        direction: z.enum(["prev", "next"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const current = await ctx.db
        .select()
        .from(media)
        .where(eq(media.id, input.mediaId))
        .limit(1);

      if (!current[0]) return null;

      const orderDir =
        input.direction === "next" ? asc : desc;
      const comparison =
        input.direction === "next"
          ? sql`${media.sortOrder} > ${current[0].sortOrder} OR (${media.sortOrder} = ${current[0].sortOrder} AND ${media.filename} > ${current[0].filename})`
          : sql`${media.sortOrder} < ${current[0].sortOrder} OR (${media.sortOrder} = ${current[0].sortOrder} AND ${media.filename} < ${current[0].filename})`;

      const adjacent = await ctx.db
        .select()
        .from(media)
        .where(and(eq(media.albumId, input.albumId), comparison))
        .orderBy(
          input.direction === "next"
            ? asc(media.sortOrder)
            : desc(media.sortOrder),
          input.direction === "next"
            ? asc(media.filename)
            : desc(media.filename)
        )
        .limit(1);

      return adjacent[0] ?? null;
    }),
});
