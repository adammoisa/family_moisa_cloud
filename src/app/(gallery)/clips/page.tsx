"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ClipsPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.clips.list.useInfiniteQuery(
      { limit: 30 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const allClips = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clips</h1>
          <p className="text-muted-foreground mt-1">
            Curated segments from family videos
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-xl" />
          ))}
        </div>
      ) : allClips.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allClips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-6 py-2 rounded-lg border bg-muted hover:bg-muted/80 text-sm transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="size-12 text-muted-foreground/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
          </svg>
          <p className="text-muted-foreground">No clips yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Open any video and create clips from it
          </p>
        </div>
      )}
    </div>
  );
}

function ClipCard({
  clip,
}: {
  clip: {
    id: string;
    title: string;
    description: string | null;
    startTime: number;
    endTime: number;
    mediaTitle: string;
    thumbnailUrl: string;
    tags: { id: string; name: string; category: string }[];
  };
}) {
  const [loaded, setLoaded] = useState(false);
  const duration = clip.endTime - clip.startTime;
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <Link
      href={`/clips/${clip.id}`}
      className="group relative overflow-hidden rounded-xl bg-muted aspect-video block"
    >
      {!loaded && <Skeleton className="absolute inset-0" />}
      <img
        src={clip.thumbnailUrl}
        alt={clip.title}
        loading="lazy"
        className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
      />

      {/* Duration badge */}
      <div className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
        {formatTime(duration)}
      </div>

      {/* Play icon */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="rounded-full bg-black/60 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="size-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
        <h3 className="text-sm font-medium text-white truncate">{clip.title}</h3>
        <p className="text-[11px] text-white/60 truncate mt-0.5">
          {clip.mediaTitle} &middot; {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
        </p>
        {clip.tags.length > 0 && (
          <div className="flex gap-1 mt-1 overflow-hidden">
            {clip.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} variant="secondary" className="text-[9px] bg-white/10 text-white/70 px-1 py-0">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
