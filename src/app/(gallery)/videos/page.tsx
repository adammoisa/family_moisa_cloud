"use client";

import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function VideosPage() {
  const { data, isLoading } = trpc.media.list.useQuery({
    type: "video",
    limit: 60,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Videos</h1>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <MasonryGrid
          items={data.items.map((m) => ({
            id: m.id,
            title: m.title,
            filename: m.filename,
            type: m.type,
            thumbnailUrl: m.thumbnailUrl,
            thumbnailFrameUrls: m.thumbnailFrameUrls,
            albumId: m.albumId,
          }))}
          hasMore={!!data.nextCursor}
        />
      ) : (
        <p className="text-muted-foreground">No videos found.</p>
      )}
    </div>
  );
}
