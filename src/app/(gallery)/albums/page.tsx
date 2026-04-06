"use client";

import { trpc } from "@/lib/trpc";
import { AlbumCard } from "@/components/gallery/album-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AlbumsPage() {
  const { data: albums, isLoading } = trpc.albums.list.useQuery({
    parentId: null,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Albums</h1>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
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
        <p className="text-muted-foreground">No albums found.</p>
      )}
    </div>
  );
}
