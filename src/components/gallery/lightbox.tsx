"use client";

import { useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { VideoPlayer } from "./video-player";
import { FavoriteButton } from "./favorite-button";

interface LightboxProps {
  mediaId: string;
  albumId?: string;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
}

export function Lightbox({ mediaId, albumId, onClose, onNavigate }: LightboxProps) {
  const { data } = trpc.media.getById.useQuery({ id: mediaId });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onNavigate) onNavigate("prev");
      if (e.key === "ArrowRight" && onNavigate) onNavigate("next");
    },
    [onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="animate-pulse text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm text-white/80 truncate max-w-[50vw]">
          {data.title || data.filename}
        </h2>
        <div className="flex items-center gap-2">
          <FavoriteButton mediaId={mediaId} variant="lightbox" />
          {data.fullUrl && (
            <a
              href={data.fullUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
          )}
          <button
            className="rounded-md p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex items-center justify-center relative px-16"
        onClick={(e) => e.stopPropagation()}
      >
        {onNavigate && (
          <>
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              onClick={() => onNavigate("prev")}
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              onClick={() => onNavigate("next")}
            >
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {data.type === "video" ? (
          <VideoPlayer src={data.fullUrl!} poster={data.thumbnailUrl || undefined} />
        ) : (
          <img
            src={data.fullUrl!}
            alt={data.title || data.filename}
            className="max-h-[calc(100vh-10rem)] max-w-full object-contain"
          />
        )}
      </div>

      {/* Bottom info */}
      {data.tags && data.tags.length > 0 && (
        <div
          className="flex items-center gap-2 p-4 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {data.tags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="shrink-0 text-white/80 bg-white/10">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
