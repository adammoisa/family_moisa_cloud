import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { albumsRouter } from "./routers/albums";
import { mediaRouter } from "./routers/media";
import { tagsRouter } from "./routers/tags";
import { peopleRouter } from "./routers/people";

export const appRouter = router({
  auth: authRouter,
  albums: albumsRouter,
  media: mediaRouter,
  tags: tagsRouter,
  people: peopleRouter,
});

export type AppRouter = typeof appRouter;
