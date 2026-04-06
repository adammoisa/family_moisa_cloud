"use client";

import { trpc } from "@/lib/trpc";
import { AlbumCard } from "@/components/gallery/album-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { data: albums, isLoading } = trpc.albums.list.useQuery({
    parentId: null,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Moisa Family Gallery
        </h1>
        <p className="text-muted-foreground mt-1">
          Browse family photos and videos
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4">Albums</h2>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : albums && albums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                slug={album.slug}
                title={album.title}
                mediaCount={album.mediaCount}
                coverUrl={album.coverUrl}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No albums yet. Run the seed script to populate the gallery.
          </p>
        )}
      </section>
    </div>
  );
}
