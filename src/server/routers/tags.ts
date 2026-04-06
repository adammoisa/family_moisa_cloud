import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { tags, mediaTags } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";

export const tagsRouter = router({
  listByCategory: protectedProcedure
    .input(
      z.object({
        category: z
          .enum(["person", "location", "event", "year", "activity", "other"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const condition = input.category
        ? eq(tags.category, input.category)
        : undefined;

      return ctx.db.select().from(tags).where(condition).orderBy(tags.name);
    }),

  autocomplete: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select()
        .from(tags)
        .where(sql`${tags.name} ILIKE ${"%" + input.query + "%"}`)
        .orderBy(tags.name)
        .limit(10);

      return results;
    }),

  getCounts: protectedProcedure
    .input(
      z.object({
        category: z
          .enum(["person", "location", "event", "year"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select({
          tagId: tags.id,
          tagName: tags.name,
          tagSlug: tags.slug,
          tagCategory: tags.category,
          count: count(mediaTags.mediaId),
        })
        .from(tags)
        .leftJoin(mediaTags, eq(tags.id, mediaTags.tagId))
        .where(input.category ? eq(tags.category, input.category) : undefined)
        .groupBy(tags.id, tags.name, tags.slug, tags.category)
        .orderBy(sql`count(${mediaTags.mediaId}) DESC`);

      return results;
    }),
});
