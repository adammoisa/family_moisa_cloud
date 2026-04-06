"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const tagSlug = searchParams.get("tag");
  const tagCategory = searchParams.get("category");

  // Full-text search
  const { data: searchResults, isLoading: searchLoading } =
    trpc.media.search.useQuery(
      { query, limit: 60 },
      { enabled: query.length > 0 }
    );

  // Tag-based search: first look up the tag by slug to get its ID
  const { data: allTags } = trpc.tags.autocomplete.useQuery(
    { query: tagSlug || "" },
    { enabled: !!tagSlug }
  );

  const matchedTag = allTags?.find(
    (t) => t.slug === tagSlug && (!tagCategory || t.category === tagCategory)
  );

  const { data: tagResults, isLoading: tagLoading } =
    trpc.media.list.useQuery(
      { tagIds: matchedTag ? [matchedTag.id] : undefined, limit: 60 },
      { enabled: !!matchedTag }
    );

  const isLoading = query ? searchLoading : tagSlug ? tagLoading : false;
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
        {matchedTag && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-muted-foreground">Filtered by:</span>
            <Badge variant="secondary">{matchedTag.name}</Badge>
          </div>
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
            thumbnailFrameUrls: m.thumbnailFrameUrls,
            albumId: m.albumId,
          }))}
        />
      ) : (
        <p className="text-muted-foreground">
          {query || tagSlug ? "No results found." : "Enter a search query to get started."}
        </p>
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
