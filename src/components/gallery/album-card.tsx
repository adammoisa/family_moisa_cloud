"use client";

import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface AlbumCardProps {
  slug: string;
  title: string;
  mediaCount: number | null;
  coverUrl: string | null;
}

export function AlbumCard({ slug, title, mediaCount, coverUrl }: AlbumCardProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Link
      href={`/albums/${slug}`}
      className="group relative overflow-hidden rounded-xl bg-muted aspect-[4/3] block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {coverUrl ? (
        <>
          {!loaded && <Skeleton className="absolute inset-0" />}
          <img
            src={coverUrl}
            alt={title}
            loading="lazy"
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <svg className="size-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
        <h3 className="text-sm font-medium text-white truncate">{title}</h3>
        {mediaCount != null && mediaCount > 0 && (
          <p className="text-xs text-white/70 mt-0.5">
            {mediaCount} {mediaCount === 1 ? "item" : "items"}
          </p>
        )}
      </div>
    </Link>
  );
}
