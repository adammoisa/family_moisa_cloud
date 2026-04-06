"use client";

import { useState, useCallback } from "react";
import { MediaCard } from "./media-card";
import { Lightbox } from "./lightbox";

interface MediaItem {
  id: string;
  title: string | null;
  filename: string;
  type: "photo" | "video";
  thumbnailUrl: string;
  thumbnailFrameUrls?: string[];
  albumId: string;
}

interface MasonryGridProps {
  items: MediaItem[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

export function MasonryGrid({
  items,
  onLoadMore,
  hasMore,
  isLoading,
}: MasonryGridProps) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!lightboxId) return;
      const currentIndex = items.findIndex((item) => item.id === lightboxId);
      if (currentIndex === -1) return;

      const newIndex =
        direction === "next"
          ? Math.min(currentIndex + 1, items.length - 1)
          : Math.max(currentIndex - 1, 0);

      setLightboxId(items[newIndex].id);
    },
    [lightboxId, items]
  );

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            id={item.id}
            title={item.title}
            filename={item.filename}
            type={item.type}
            thumbnailUrl={item.thumbnailUrl}
            thumbnailFrameUrls={item.thumbnailFrameUrls}
            onClick={() => setLightboxId(item.id)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-6 py-2 rounded-lg border bg-muted hover:bg-muted/80 text-sm transition-colors disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {lightboxId && (
        <Lightbox
          mediaId={lightboxId}
          albumId={items.find((i) => i.id === lightboxId)?.albumId}
          onClose={() => setLightboxId(null)}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
