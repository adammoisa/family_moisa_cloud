"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteButton } from "./favorite-button";

interface MediaCardProps {
  id: string;
  title: string | null;
  filename: string;
  type: "photo" | "video";
  thumbnailUrl: string;
  thumbnailFrameUrls?: string[];
  onClick: () => void;
}

export function MediaCard({
  id,
  title,
  filename,
  type,
  thumbnailUrl,
  thumbnailFrameUrls,
  onClick,
}: MediaCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const frames = thumbnailFrameUrls && thumbnailFrameUrls.length > 0
    ? thumbnailFrameUrls
    : null;

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (frames && frames.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
      }, 800);
    }
  }, [frames]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setCurrentFrame(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const displayUrl = isHovering && frames ? frames[currentFrame] : thumbnailUrl;

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative overflow-hidden rounded-lg bg-muted aspect-square cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {!loaded && !error && (
        <Skeleton className="absolute inset-0" />
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-2 p-3">
          <svg className="size-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            {type === "video" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            )}
          </svg>
          {type === "video" && (
            <p className="text-[10px] text-muted-foreground text-center truncate max-w-full">
              {title || filename}
            </p>
          )}
        </div>
      ) : (
        <img
          src={displayUrl}
          alt={title || filename}
          loading="lazy"
          className={`h-full w-full object-cover transition-all duration-300 ${
            isHovering && !frames ? "scale-105" : ""
          } ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}

      {/* Favorite button */}
      <FavoriteButton mediaId={id} variant="card" />

      {/* Video overlay */}
      {type === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/60 p-2">
            <svg className="size-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Frame indicator dots for video hover */}
      {isHovering && frames && frames.length > 1 && (
        <div className="absolute top-2 inset-x-0 flex justify-center gap-1 pointer-events-none">
          {frames.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === currentFrame ? "w-4 bg-white" : "w-1 bg-white/50"
              }`}
            />
          ))}
        </div>
      )}

      {/* Title - always visible for videos, hover-only for photos */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity ${
          type === "video" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <p className="text-xs text-white truncate">
          {title || filename}
        </p>
      </div>
    </button>
  );
}
