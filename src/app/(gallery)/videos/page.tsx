"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function VideosPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.media.list.useInfiniteQuery(
      { type: "video", limit: 40 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Videos</h1>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : allItems.length > 0 ? (
        <MasonryGrid
          items={allItems.map((m) => ({
            id: m.id,
            title: m.title,
            filename: m.filename,
            type: m.type,
            thumbnailUrl: m.thumbnailUrl,
            thumbnailFrameUrls: m.thumbnailFrameUrls,
            albumId: m.albumId,
          }))}
          hasMore={!!hasNextPage}
          onLoadMore={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
        />
      ) : (
        <p className="text-muted-foreground">No videos found.</p>
      )}
    </div>
  );
}
