"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const tag = searchParams.get("tag");

  const { data: searchResults, isLoading: searchLoading } =
    trpc.media.search.useQuery(
      { query, limit: 60 },
      { enabled: query.length > 0 }
    );

  const { data: tagResults, isLoading: tagLoading } =
    trpc.media.list.useQuery(
      { tagIds: tag ? [tag] : undefined, limit: 60 },
      { enabled: !!tag }
    );

  const isLoading = searchLoading || tagLoading;
  const items = query
    ? searchResults || []
    : tagResults?.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Search Results
        </h1>
        {query && (
          <p className="text-muted-foreground mt-1">
            Results for &quot;{query}&quot;
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <MasonryGrid
          items={items.map((m) => ({
            id: m.id,
            title: m.title,
            filename: m.filename,
            type: m.type,
            thumbnailUrl: m.thumbnailUrl,
            albumId: m.albumId,
          }))}
        />
      ) : (
        <p className="text-muted-foreground">No results found.</p>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
