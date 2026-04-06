import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { albums, media } from "@/db/schema";
import { eq, and, isNull, inArray, asc, sql, count } from "drizzle-orm";
import { generateSignedUrl } from "../services/s3";

export const albumsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        parentId: z.string().uuid().nullable().default(null),
      })
    )
    .query(async ({ ctx, input }) => {
      const condition = input.parentId
        ? eq(albums.parentId, input.parentId)
        : isNull(albums.parentId);

      const result = await ctx.db
        .select()
        .from(albums)
        .where(condition)
        .orderBy(asc(albums.sortOrder), asc(albums.title));

      // Batch load cover images (avoid N+1)
      const coverIds = result
        .map((a) => a.coverMediaId)
        .filter((id): id is string => id !== null);

      const coverMediaList = coverIds.length > 0
        ? await ctx.db.select().from(media).where(inArray(media.id, coverIds))
        : [];

      const coverMediaMap = new Map(coverMediaList.map((m) => [m.id, m]));

      const albumsWithCovers = await Promise.all(
        result.map(async (album) => {
          let coverUrl: string | null = null;
          const coverMedia = album.coverMediaId
            ? coverMediaMap.get(album.coverMediaId)
            : undefined;
          if (coverMedia) {
            const key = coverMedia.thumbnailS3Key || coverMedia.smallS3Key || coverMedia.s3Key;
            coverUrl = await generateSignedUrl(key);
          }
          return { ...album, coverUrl };
        })
      );

      return albumsWithCovers;
    }),

  getBySlug: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      const album = await ctx.db
        .select()
        .from(albums)
        .where(eq(albums.slug, input.slug))
        .limit(1);

      if (!album[0]) return null;

      // Get child albums
      const children = await ctx.db
        .select()
        .from(albums)
        .where(eq(albums.parentId, album[0].id))
        .orderBy(asc(albums.sortOrder), asc(albums.title));

      // Get paginated media
      const mediaConditions: any[] = [eq(media.albumId, album[0].id)];

      if (input.cursor) {
        const cursorItem = await ctx.db
          .select({ sortOrder: media.sortOrder, filename: media.filename })
          .from(media)
          .where(eq(media.id, input.cursor))
          .limit(1);

        if (cursorItem[0]) {
          mediaConditions.push(
            sql`(${media.sortOrder} > ${cursorItem[0].sortOrder} OR (${media.sortOrder} = ${cursorItem[0].sortOrder} AND ${media.filename} > ${cursorItem[0].filename}))`
          );
        }
      }

      const mediaItems = await ctx.db
        .select()
        .from(media)
        .where(and(...mediaConditions))
        .orderBy(asc(media.sortOrder), asc(media.filename))
        .limit(input.limit + 1);

      const hasMore = mediaItems.length > input.limit;
      const items = hasMore ? mediaItems.slice(0, input.limit) : mediaItems;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      // Batch signed URLs for thumbnails + video frames
      const itemsWithUrls = await Promise.all(
        items.map(async (item) => {
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

      // Batch load child album covers (avoid N+1)
      const childCoverIds = children
        .map((c) => c.coverMediaId)
        .filter((id): id is string => id !== null);

      const childCoverList = childCoverIds.length > 0
        ? await ctx.db.select().from(media).where(inArray(media.id, childCoverIds))
        : [];

      const childCoverMap = new Map(childCoverList.map((m) => [m.id, m]));

      const childrenWithCovers = await Promise.all(
        children.map(async (child) => {
          let coverUrl: string | null = null;
          const coverMedia = child.coverMediaId
            ? childCoverMap.get(child.coverMediaId)
            : undefined;
          if (coverMedia) {
            const key = coverMedia.thumbnailS3Key || coverMedia.smallS3Key || coverMedia.s3Key;
            coverUrl = await generateSignedUrl(key);
          }
          return { ...child, coverUrl };
        })
      );

      return {
        album: album[0],
        children: childrenWithCovers,
        media: itemsWithUrls,
        nextCursor,
      };
    }),

  getBreadcrumbs: protectedProcedure
    .input(z.object({ albumId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const breadcrumbs: { id: string; title: string; slug: string }[] = [];
      let currentId: string | null = input.albumId;

      while (currentId) {
        const album = await ctx.db
          .select({
            id: albums.id,
            title: albums.title,
            slug: albums.slug,
            parentId: albums.parentId,
          })
          .from(albums)
          .where(eq(albums.id, currentId))
          .limit(1);

        if (!album[0]) break;
        breadcrumbs.unshift({
          id: album[0].id,
          title: album[0].title,
          slug: album[0].slug,
        });
        currentId = album[0].parentId;
      }

      return breadcrumbs;
    }),
});
