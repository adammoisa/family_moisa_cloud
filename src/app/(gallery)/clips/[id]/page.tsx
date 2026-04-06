"use client";

import { use, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function ClipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: clip, isLoading } = trpc.clips.getById.useQuery({ id });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Seek to start time when clip loads
  useEffect(() => {
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.startTime;
    }
  }, [clip]);

  // Pause at end time
  useEffect(() => {
    if (!clip || !videoRef.current) return;
    const video = videoRef.current;

    const handleTimeUpdate = () => {
      if (video.currentTime >= clip.endTime) {
        video.pause();
        setPlaying(false);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [clip]);

  const handlePlayPause = () => {
    if (!videoRef.current || !clip) return;
    if (videoRef.current.paused) {
      if (videoRef.current.currentTime >= clip.endTime) {
        videoRef.current.currentTime = clip.startTime;
      }
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-video w-full max-w-4xl rounded-xl" />
      </div>
    );
  }

  if (!clip) {
    return <p className="text-muted-foreground">Clip not found.</p>;
  }

  const duration = clip.endTime - clip.startTime;

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clips" />}>Clips</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{clip.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Video player */}
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={clip.videoUrl}
          className="w-full aspect-video"
          playsInline
          onClick={handlePlayPause}
        />
        {!playing && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
          >
            <div className="rounded-full bg-white/90 p-4">
              <svg className="size-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Info */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">{clip.title}</h1>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formatTime(duration)} clip</span>
          <span>&middot;</span>
          <span>
            {formatTime(clip.startTime)} - {formatTime(clip.endTime)} from{" "}
            <span className="text-foreground">{clip.media.title || clip.media.filename}</span>
          </span>
        </div>

        {clip.description && (
          <p className="text-sm text-muted-foreground">{clip.description}</p>
        )}

        {clip.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clip.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground/60">
          Created by {clip.createdByName}
        </p>
      </div>

      {/* Other clips from same video */}
      <OtherClips mediaId={clip.mediaId} currentClipId={clip.id} />
    </div>
  );
}

function OtherClips({ mediaId, currentClipId }: { mediaId: string; currentClipId: string }) {
  const { data } = trpc.clips.list.useInfiniteQuery(
    { mediaId, limit: 10 },
    { getNextPageParam: (p) => p.nextCursor }
  );

  const otherClips = data?.pages
    .flatMap((p) => p.items)
    .filter((c) => c.id !== currentClipId);

  if (!otherClips || otherClips.length === 0) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <h2 className="text-sm font-medium text-muted-foreground">Other clips from this video</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {otherClips.map((clip) => (
          <Link
            key={clip.id}
            href={`/clips/${clip.id}`}
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors"
          >
            <div className="relative shrink-0 w-24 aspect-video rounded overflow-hidden bg-muted">
              <img src={clip.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{clip.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
