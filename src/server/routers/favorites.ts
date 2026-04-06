import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { favorites, media } from "@/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { generateSignedUrl } from "../services/s3";

export const favoritesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(favorites.userId, ctx.user.id)];

      if (input.cursor) {
        const cursorItem = await ctx.db
          .select({ createdAt: favorites.createdAt })
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, ctx.user.id),
              eq(favorites.mediaId, input.cursor)
            )
          )
          .limit(1);

        if (cursorItem[0]) {
          const sql = await import("drizzle-orm").then((m) => m.sql);
          conditions.push(
            sql`${favorites.createdAt} < ${cursorItem[0].createdAt}`
          );
        }
      }

      const items = await ctx.db
        .select({ media, favoriteId: favorites.id, favoritedAt: favorites.createdAt })
        .from(favorites)
        .innerJoin(media, eq(favorites.mediaId, media.id))
        .where(and(...conditions))
        .orderBy(asc(favorites.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      const result = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore
        ? result[result.length - 1]?.media.id
        : undefined;

      const itemsWithUrls = await Promise.all(
        result.map(async ({ media: item }) => {
          const thumbnailKey =
            item.thumbnailS3Key || item.smallS3Key || item.s3Key;
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

      return { items: itemsWithUrls, nextCursor };
    }),

  toggle: protectedProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, ctx.user.id),
            eq(favorites.mediaId, input.mediaId)
          )
        )
        .limit(1);

      if (existing[0]) {
        await ctx.db
          .delete(favorites)
          .where(eq(favorites.id, existing[0].id));
        return { favorited: false };
      } else {
        await ctx.db
          .insert(favorites)
          .values({ userId: ctx.user.id, mediaId: input.mediaId });
        return { favorited: true };
      }
    }),

  isFavorited: protectedProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, ctx.user.id),
            eq(favorites.mediaId, input.mediaId)
          )
        )
        .limit(1);
      return { favorited: result.length > 0 };
    }),

  isFavoritedBatch: protectedProcedure
    .input(z.object({ mediaIds: z.array(z.string().uuid()) }))
    .query(async ({ ctx, input }) => {
      if (input.mediaIds.length === 0) return {};
      const result = await ctx.db
        .select({ mediaId: favorites.mediaId })
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, ctx.user.id),
            inArray(favorites.mediaId, input.mediaIds)
          )
        );
      const set = new Set(result.map((r) => r.mediaId));
      return Object.fromEntries(
        input.mediaIds.map((id) => [id, set.has(id)])
      );
    }),
});
