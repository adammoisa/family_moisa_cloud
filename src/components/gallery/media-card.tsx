"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface MediaCardProps {
  id: string;
  title: string | null;
  filename: string;
  type: "photo" | "video";
  thumbnailUrl: string;
  onClick: () => void;
}

export function MediaCard({
  title,
  filename,
  type,
  thumbnailUrl,
  onClick,
}: MediaCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg bg-muted aspect-square cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {!loaded && !error && (
        <Skeleton className="absolute inset-0" />
      )}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <svg className="size-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      ) : (
        <img
          src={thumbnailUrl}
          alt={title || filename}
          loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}

      {/* Video overlay */}
      {type === "video" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/60 p-2">
            <svg className="size-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Hover overlay with title */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="text-xs text-white truncate">
          {title || filename}
        </p>
      </div>
    </button>
  );
}
