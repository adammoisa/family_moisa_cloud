"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function FavoritesPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.favorites.list.useInfiniteQuery(
      { limit: 40 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allItems = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Favorites</h1>
        <p className="text-muted-foreground mt-1">
          Your saved photos and videos
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="size-12 text-muted-foreground/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-muted-foreground">No favorites yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Click the heart on any photo or video to save it here
          </p>
        </div>
      )}
    </div>
  );
}
