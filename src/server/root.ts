import { router } from "./trpc";
import { authRouter } from "./routers/auth";
import { albumsRouter } from "./routers/albums";
import { mediaRouter } from "./routers/media";
import { tagsRouter } from "./routers/tags";
import { peopleRouter } from "./routers/people";
import { favoritesRouter } from "./routers/favorites";

export const appRouter = router({
  auth: authRouter,
  albums: albumsRouter,
  media: mediaRouter,
  tags: tagsRouter,
  people: peopleRouter,
  favorites: favoritesRouter,
});

export type AppRouter = typeof appRouter;
