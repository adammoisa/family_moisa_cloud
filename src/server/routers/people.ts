import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { tags, mediaTags, media } from "@/db/schema";
import { eq, and, asc, count, sql } from "drizzle-orm";
import { generateSignedUrl } from "../services/s3";

export const peopleRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const people = await ctx.db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        mediaCount: count(mediaTags.mediaId),
      })
      .from(tags)
      .leftJoin(mediaTags, eq(tags.id, mediaTags.tagId))
      .where(eq(tags.category, "person"))
      .groupBy(tags.id, tags.name, tags.slug)
      .orderBy(sql`count(${mediaTags.mediaId}) DESC`);

    // Get a cover photo for each person
    const peopleWithCovers = await Promise.all(
      people.map(async (person) => {
        const coverMedia = await ctx.db
          .select()
          .from(media)
          .innerJoin(mediaTags, eq(media.id, mediaTags.mediaId))
          .where(
            and(eq(mediaTags.tagId, person.id), eq(media.type, "photo"))
          )
          .limit(1);

        let coverUrl: string | null = null;
        if (coverMedia[0]) {
          const key =
            coverMedia[0].media.thumbnailS3Key ||
            coverMedia[0].media.smallS3Key ||
            coverMedia[0].media.s3Key;
          coverUrl = await generateSignedUrl(key);
        }

        return { ...person, coverUrl };
      })
    );

    return peopleWithCovers;
  }),

  getMedia: protectedProcedure
    .input(
      z.object({
        personSlug: z.string(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      const person = await ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.slug, input.personSlug), eq(tags.category, "person")))
        .limit(1);

      if (!person[0]) return { person: null, items: [], nextCursor: undefined };

      const items = await ctx.db
        .select({ media })
        .from(media)
        .innerJoin(mediaTags, eq(media.id, mediaTags.mediaId))
        .where(eq(mediaTags.tagId, person[0].id))
        .orderBy(asc(media.sortOrder), asc(media.filename))
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
          return { ...item, thumbnailUrl };
        })
      );

      return { person: person[0], items: itemsWithUrls, nextCursor };
    }),
});
