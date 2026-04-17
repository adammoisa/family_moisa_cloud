"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { ClipCreator } from "./clip-creator";

interface ClipViewerProps {
  clipId: string;
  onClose: () => void;
}

export function ClipViewer({ clipId, onClose }: ClipViewerProps) {
  const { data: clip } = trpc.clips.getById.useQuery({ id: clipId });
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showEditor, setShowEditor] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showEditor) setShowEditor(false);
        else onClose();
      }
    },
    [onClose, showEditor]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Seek to start and auto-play when loaded
  useEffect(() => {
    if (!clip || !videoRef.current) return;
    videoRef.current.currentTime = clip.startTime;
  }, [clip]);

  // Pause at end time
  useEffect(() => {
    if (!clip || !videoRef.current) return;
    const video = videoRef.current;
    const handler = () => {
      if (video.currentTime >= clip.endTime) {
        video.pause();
        setPlaying(false);
      }
    };
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [clip]);

  const togglePlay = () => {
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

  if (!clip) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="animate-pulse text-white">Loading...</div>
      </div>
    );
  }

  if (showEditor) {
    return (
      <ClipCreator
        mediaId={clip.mediaId}
        videoUrl={clip.videoUrl}
        videoTitle={clip.media.title || clip.media.filename}
        clipId={clipId}
        onClose={() => setShowEditor(false)}
        onDeleted={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between p-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-sm font-medium text-white">{clip.title}</h2>
          <p className="text-xs text-white/50">
            {clip.media.title || clip.media.filename} &middot; {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/clips/${clipId}/download`}
            download
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); setShowEditor(true); }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="flex-1 flex flex-col items-center justify-center px-16" onClick={(e) => e.stopPropagation()}>
        <div className="relative max-h-[calc(100vh-14rem)] max-w-full">
          <video
            ref={videoRef}
            src={`${clip.videoUrl}#t=${clip.startTime},${clip.endTime}`}
            className="max-h-[calc(100vh-14rem)] max-w-full rounded"
            playsInline
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
          />
          {!playing && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="rounded-full bg-white/90 p-3">
                <svg className="size-8 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
          )}
        </div>

        {/* Clip timeline */}
        <div className="w-full max-w-2xl mt-4 px-4">
          <div
            ref={timelineRef}
            className="relative h-2 bg-white/10 rounded-full cursor-pointer"
            onClick={(e) => {
              if (!timelineRef.current || !videoRef.current) return;
              const rect = timelineRef.current.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const clipDur = clip.endTime - clip.startTime;
              videoRef.current.currentTime = clip.startTime + pct * clipDur;
            }}
          >
            {/* Progress */}
            <div
              className="absolute top-0 left-0 h-full bg-white/60 rounded-full transition-[width] duration-100"
              style={{
                width: `${Math.max(0, Math.min(100, ((currentTime - clip.startTime) / (clip.endTime - clip.startTime)) * 100))}%`,
              }}
            />
            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow -ml-1.5"
              style={{
                left: `${Math.max(0, Math.min(100, ((currentTime - clip.startTime) / (clip.endTime - clip.startTime)) * 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-white/40 font-mono">{formatTime(currentTime - clip.startTime)}</span>
            <span className="text-[10px] text-white/40 font-mono">{formatTime(clip.endTime - clip.startTime)}</span>
          </div>
        </div>
      </div>

      {/* Bottom tags */}
      {clip.tags.length > 0 && (
        <div className="flex items-center gap-2 p-4 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
          {clip.tags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="shrink-0 text-white/80 bg-white/10">
              {tag.name}
            </Badge>
          ))}
          <span className="text-xs text-white/30 ml-2">by {clip.createdByName}</span>
        </div>
      )}
    </div>
  );
}
