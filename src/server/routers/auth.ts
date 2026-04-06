import { z } from "zod/v4";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { emailWhitelist, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const authRouter = router({
  checkWhitelist: publicProcedure
    .input(z.object({ email: z.email() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(emailWhitelist)
        .where(eq(emailWhitelist.email, input.email.toLowerCase()))
        .limit(1);
      return { allowed: result.length > 0 };
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, ctx.user.id))
      .limit(1);
    return result[0] ?? null;
  }),
});
