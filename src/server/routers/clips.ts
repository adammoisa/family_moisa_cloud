import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { clips, clipTags, tags, media, profiles } from "@/db/schema";
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import { generateSignedUrl } from "../services/s3";
import slugifyLib from "slugify";

function slugify(s: string): string {
  return slugifyLib(s, { lower: true, strict: true, trim: true }) || "untitled";
}

export const clipsRouter = router({
  // List all clips, optionally filtered by video
  list: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid().optional(),
        cursor: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(40),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      if (input.mediaId) conditions.push(eq(clips.mediaId, input.mediaId));

      if (input.cursor) {
        const cursorItem = await ctx.db
          .select({ createdAt: clips.createdAt })
          .from(clips)
          .where(eq(clips.id, input.cursor))
          .limit(1);
        if (cursorItem[0]) {
          conditions.push(sql`${clips.createdAt} > ${cursorItem[0].createdAt}`);
        }
      }

      const items = await ctx.db
        .select({
          clip: clips,
          mediaTitle: media.title,
          mediaFilename: media.filename,
          mediaS3Key: media.s3Key,
          mediaThumbnailS3Key: media.thumbnailS3Key,
          mediaSmallS3Key: media.smallS3Key,
          mediaType: media.type,
        })
        .from(clips)
        .innerJoin(media, eq(clips.mediaId, media.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(input.mediaId ? asc(clips.startTime) : desc(clips.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      const result = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore ? result[result.length - 1]?.clip.id : undefined;

      // Get tags for each clip + thumbnail URLs
      const enriched = await Promise.all(
        result.map(async (item) => {
          const clipTagsList = await ctx.db
            .select({ id: tags.id, name: tags.name, category: tags.category, slug: tags.slug })
            .from(clipTags)
            .innerJoin(tags, eq(clipTags.tagId, tags.id))
            .where(eq(clipTags.clipId, item.clip.id));

          const thumbKey = item.mediaThumbnailS3Key || item.mediaSmallS3Key || item.mediaS3Key;
          const thumbnailUrl = await generateSignedUrl(thumbKey);

          return {
            ...item.clip,
            mediaTitle: item.mediaTitle || item.mediaFilename,
            thumbnailUrl,
            tags: clipTagsList,
          };
        })
      );

      return { items: enriched, nextCursor };
    }),

  // Search clips by title/description
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      const results = await ctx.db
        .select({
          clip: clips,
          mediaTitle: media.title,
          mediaFilename: media.filename,
          mediaThumbnailS3Key: media.thumbnailS3Key,
          mediaSmallS3Key: media.smallS3Key,
          mediaS3Key: media.s3Key,
        })
        .from(clips)
        .innerJoin(media, eq(clips.mediaId, media.id))
        .where(
          sql`(${clips.title} ILIKE ${"%" + input.query + "%"} OR ${clips.description} ILIKE ${"%" + input.query + "%"})`
        )
        .orderBy(desc(clips.createdAt))
        .limit(input.limit);

      return Promise.all(
        results.map(async (r) => {
          const thumbKey = r.mediaThumbnailS3Key || r.mediaSmallS3Key || r.mediaS3Key;
          const thumbnailUrl = await generateSignedUrl(thumbKey);
          return {
            ...r.clip,
            mediaTitle: r.mediaTitle || r.mediaFilename,
            thumbnailUrl,
          };
        })
      );
    }),

  // Get a single clip with signed video URL
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({ clip: clips, media })
        .from(clips)
        .innerJoin(media, eq(clips.mediaId, media.id))
        .where(eq(clips.id, input.id))
        .limit(1);

      if (!result[0]) return null;

      const videoUrl = await generateSignedUrl(result[0].media.s3Key);
      const clipTagsList = await ctx.db
        .select({ id: tags.id, name: tags.name, category: tags.category, slug: tags.slug })
        .from(clipTags)
        .innerJoin(tags, eq(clipTags.tagId, tags.id))
        .where(eq(clipTags.clipId, input.id));

      const creator = await ctx.db
        .select({ name: profiles.name, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, result[0].clip.createdBy))
        .limit(1);

      return {
        ...result[0].clip,
        media: result[0].media,
        videoUrl,
        tags: clipTagsList,
        createdByName: creator[0]?.name || creator[0]?.email || "Unknown",
      };
    }),

  // Create a clip
  create: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        startTime: z.number().min(0),
        endTime: z.number().min(0),
        tagNames: z.array(z.string()).optional(),
        people: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [clip] = await ctx.db
        .insert(clips)
        .values({
          mediaId: input.mediaId,
          title: input.title,
          description: input.description || null,
          startTime: Math.round(input.startTime),
          endTime: Math.round(input.endTime),
          createdBy: ctx.user.id,
        })
        .returning();

      // Add tags
      const allTagNames = [
        ...(input.tagNames || []),
        ...(input.people || []),
      ];

      for (const name of input.people || []) {
        const slug = slugify(name);
        await ctx.db
          .insert(tags)
          .values({ name, slug, category: "person" })
          .onConflictDoNothing();
        const tag = await ctx.db
          .select()
          .from(tags)
          .where(and(eq(tags.slug, slug), eq(tags.category, "person")))
          .limit(1);
        if (tag[0]) {
          await ctx.db
            .insert(clipTags)
            .values({ clipId: clip.id, tagId: tag[0].id })
            .onConflictDoNothing();
        }
      }

      for (const name of input.tagNames || []) {
        const slug = slugify(name);
        await ctx.db
          .insert(tags)
          .values({ name, slug, category: "event" })
          .onConflictDoNothing();
        const tag = await ctx.db
          .select()
          .from(tags)
          .where(eq(tags.slug, slug))
          .limit(1);
        if (tag[0]) {
          await ctx.db
            .insert(clipTags)
            .values({ clipId: clip.id, tagId: tag[0].id })
            .onConflictDoNothing();
        }
      }

      return clip;
    }),

  // Update a clip
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        mediaId: z.string().uuid(),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        startTime: z.number().min(0),
        endTime: z.number().min(0),
        tagNames: z.array(z.string()).optional(),
        people: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(clips)
        .set({
          title: input.title,
          description: input.description || null,
          startTime: Math.round(input.startTime),
          endTime: Math.round(input.endTime),
          updatedAt: new Date(),
        })
        .where(eq(clips.id, input.id));

      // Replace tags: delete old, add new
      await ctx.db.delete(clipTags).where(eq(clipTags.clipId, input.id));

      for (const name of input.people || []) {
        const slug = slugify(name);
        await ctx.db.insert(tags).values({ name, slug, category: "person" }).onConflictDoNothing();
        const tag = await ctx.db.select().from(tags).where(and(eq(tags.slug, slug), eq(tags.category, "person"))).limit(1);
        if (tag[0]) await ctx.db.insert(clipTags).values({ clipId: input.id, tagId: tag[0].id }).onConflictDoNothing();
      }

      for (const name of input.tagNames || []) {
        const slug = slugify(name);
        await ctx.db.insert(tags).values({ name, slug, category: "event" }).onConflictDoNothing();
        const tag = await ctx.db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
        if (tag[0]) await ctx.db.insert(clipTags).values({ clipId: input.id, tagId: tag[0].id }).onConflictDoNothing();
      }

      return { success: true };
    }),

  // Delete a clip (creator only, enforced by RLS)
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(clips).where(eq(clips.id, input.id));
      return { success: true };
    }),
});
