"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { trpc } from "@/lib/trpc";
import { MasonryGrid } from "@/components/gallery/masonry-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClipViewer } from "@/components/gallery/clip-viewer";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const tagSlug = searchParams.get("tag");
  const tagCategory = searchParams.get("category");
  const [activeClipId, setActiveClipId] = useState<string | null>(null);

  // Full-text search for media
  const { data: searchResults, isLoading: searchLoading } =
    trpc.media.search.useQuery(
      { query, limit: 60 },
      { enabled: query.length > 0 }
    );

  // Search clips too
  const { data: clipResults } = trpc.clips.search.useQuery(
    { query, limit: 20 },
    { enabled: query.length > 0 }
  );

  // Tag-based search
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
  const mediaItems = query
    ? searchResults || []
    : tagResults?.items || [];

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search Results</h1>
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

      {/* Clips results */}
      {clipResults && clipResults.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Clips</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {clipResults.map((clip) => (
              <button
                key={clip.id}
                onClick={() => setActiveClipId(clip.id)}
                className="group relative overflow-hidden rounded-xl bg-muted aspect-video block w-full text-left"
              >
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
                  {formatTime(clip.endTime - clip.startTime)}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <h3 className="text-sm font-medium text-white truncate">{clip.title}</h3>
                  <p className="text-[11px] text-white/60 truncate">{clip.mediaTitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Media results */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : mediaItems.length > 0 ? (
        <section>
          {clipResults && clipResults.length > 0 && (
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Photos & Videos</h2>
          )}
          <MasonryGrid
            items={mediaItems.map((m) => ({
              id: m.id,
              title: m.title,
              filename: m.filename,
              type: m.type,
              thumbnailUrl: m.thumbnailUrl,
              thumbnailFrameUrls: m.thumbnailFrameUrls,
              albumId: m.albumId,
            }))}
          />
        </section>
      ) : !clipResults?.length ? (
        <p className="text-muted-foreground">
          {query || tagSlug ? "No results found." : "Enter a search query to get started."}
        </p>
      ) : null}

      {activeClipId && (
        <ClipViewer clipId={activeClipId} onClose={() => setActiveClipId(null)} />
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
