import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { db, supabase, user, headers: opts.headers };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
