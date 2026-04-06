"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClipCreatorProps {
  mediaId: string;
  videoUrl: string;
  videoTitle: string;
  onClose: () => void;
}

export function ClipCreator({ mediaId, videoUrl, videoTitle, onClose }: ClipCreatorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [peopleInput, setPeopleInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState<"start" | "end" | "playhead" | null>(null);

  const utils = trpc.useUtils();
  const createClip = trpc.clips.create.useMutation({
    onSuccess: () => {
      utils.clips.list.invalidate();
      setSaved(true);
      setSaving(false);
    },
    onError: () => setSaving(false),
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "i") handleSetStart();
      if (e.key === "o") handleSetEnd();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [currentTime]);

  const handleVideoLoaded = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setEndTime(Math.min(30, videoRef.current.duration));
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleSetStart = () => setStartTime(Math.floor(currentTime));
  const handleSetEnd = () => setEndTime(Math.ceil(currentTime));

  const handlePreview = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = startTime;
    videoRef.current.play();
    setPlaying(true);
  };

  // Pause at end time during preview
  useEffect(() => {
    if (playing && currentTime >= endTime && videoRef.current) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, [playing, currentTime, endTime]);

  // Timeline drag handling
  const getTimeFromX = useCallback((clientX: number) => {
    if (!timelineRef.current || duration === 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handleTimelineMouseDown = (e: React.MouseEvent, type: "start" | "end" | "playhead") => {
    e.preventDefault();
    setDragging(type);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const time = getTimeFromX(e.clientX);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const time = getTimeFromX(e.clientX);
      if (dragging === "start") setStartTime(Math.max(0, Math.min(time, endTime - 1)));
      else if (dragging === "end") setEndTime(Math.min(duration, Math.max(time, startTime + 1)));
      else if (dragging === "playhead" && videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    };
    const handleUp = () => setDragging(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, startTime, endTime, duration, getTimeFromX]);

  const handleSave = async () => {
    if (!title.trim() || endTime <= startTime) return;
    setSaving(true);
    await createClip.mutateAsync({
      mediaId,
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: Math.round(startTime),
      endTime: Math.round(endTime),
      tagNames: tagInput.split(",").map((t) => t.trim()).filter(Boolean),
      people: peopleInput.split(",").map((p) => p.trim()).filter(Boolean),
    });
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const pct = (t: number) => duration > 0 ? `${(t / duration) * 100}%` : "0%";

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-4 h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-sm font-medium">Create Clip</span>
          <span className="text-xs text-muted-foreground">from {videoTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <kbd className="border rounded px-1">I</kbd> set in
          <kbd className="border rounded px-1">O</kbd> set out
          <kbd className="border rounded px-1">Space</kbd> play/pause
        </div>
      </div>

      {/* Main content: video left, form right */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video + timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video */}
          <div className="flex-1 flex items-center justify-center bg-black p-4 min-h-0">
            <video
              ref={videoRef}
              src={videoUrl}
              className="max-h-full max-w-full rounded"
              playsInline
              onClick={togglePlay}
              onLoadedMetadata={handleVideoLoaded}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </div>

          {/* Timeline */}
          <div className="border-t bg-muted/30 px-4 py-3 shrink-0">
            {/* Time display */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)}</span>
              <span className="text-xs font-mono text-primary">
                Clip: {formatTime(startTime)} - {formatTime(endTime)} ({formatTime(endTime - startTime)})
              </span>
              <span className="text-xs font-mono text-muted-foreground">{formatTime(duration)}</span>
            </div>

            {/* Timeline bar */}
            <div
              ref={timelineRef}
              className="relative h-10 bg-muted rounded cursor-pointer select-none"
              onClick={handleTimelineClick}
            >
              {/* Selected range */}
              <div
                className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary"
                style={{ left: pct(startTime), width: pct(endTime - startTime) }}
              />

              {/* Start handle */}
              <div
                className="absolute top-0 bottom-0 w-3 bg-green-500 rounded-l cursor-ew-resize z-10 flex items-center justify-center"
                style={{ left: pct(startTime), transform: "translateX(-100%)" }}
                onMouseDown={(e) => handleTimelineMouseDown(e, "start")}
              >
                <div className="w-0.5 h-4 bg-white/80 rounded" />
              </div>

              {/* End handle */}
              <div
                className="absolute top-0 bottom-0 w-3 bg-red-500 rounded-r cursor-ew-resize z-10 flex items-center justify-center"
                style={{ left: pct(endTime) }}
                onMouseDown={(e) => handleTimelineMouseDown(e, "end")}
              >
                <div className="w-0.5 h-4 bg-white/80 rounded" />
              </div>

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-20"
                style={{ left: pct(currentTime) }}
                onMouseDown={(e) => handleTimelineMouseDown(e, "playhead")}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full shadow" />
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={handleSetStart} className="text-xs">
                <span className="text-green-500 mr-1">|</span> Set In
              </Button>
              <Button variant="outline" size="sm" onClick={handleSetEnd} className="text-xs">
                Set Out <span className="text-red-500 ml-1">|</span>
              </Button>
              <Button variant="outline" size="sm" onClick={togglePlay} className="text-xs">
                {playing ? "Pause" : "Play"}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePreview} className="text-xs">
                Preview Clip
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Form panel */}
        <div className="w-80 border-l flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="clip-title" className="text-xs">Title *</Label>
              <Input
                id="clip-title"
                placeholder="e.g. David's 2nd Birthday"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clip-desc" className="text-xs">Description</Label>
              <Input
                id="clip-desc"
                placeholder="What's happening in this clip?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clip-people" className="text-xs">People (comma-separated)</Label>
              <Input
                id="clip-people"
                placeholder="David, Batya, Avi"
                value={peopleInput}
                onChange={(e) => setPeopleInput(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clip-tags" className="text-xs">Tags (comma-separated)</Label>
              <Input
                id="clip-tags"
                placeholder="Birthday, Party, Dancing"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
            </div>

            {/* Clip info - editable in/out points */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">In point</span>
                <TimeInput value={startTime} onChange={(t) => { setStartTime(t); if (videoRef.current) videoRef.current.currentTime = t; }} max={endTime - 1} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Out point</span>
                <TimeInput value={endTime} onChange={(t) => setEndTime(t)} min={startTime + 1} max={duration} />
              </div>
              <div className="flex justify-between border-t pt-1.5 mt-1">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono font-medium">{formatTime(endTime - startTime)}</span>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="p-4 border-t">
            {saved ? (
              <div className="text-center space-y-2">
                <p className="text-sm text-green-500 font-medium">Clip created!</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                    setSaved(false);
                    setTitle("");
                    setDescription("");
                    setTagInput("");
                    setPeopleInput("");
                  }}>
                    Create another
                  </Button>
                  <Button size="sm" className="flex-1" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={!title.trim() || endTime <= startTime || saving}
              >
                {saving ? "Saving..." : "Create Clip"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  min = 0,
  max = Infinity,
}: {
  value: number;
  onChange: (seconds: number) => void;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const parseTime = (str: string): number | null => {
    const parts = str.trim().split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  };

  const handleStart = () => {
    setText(formatTime(value));
    setEditing(true);
  };

  const handleConfirm = () => {
    const parsed = parseTime(text);
    if (parsed !== null) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-20 bg-background border rounded px-1.5 py-0.5 text-xs font-mono text-right outline-none focus:ring-1 focus:ring-primary"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleConfirm}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      onClick={handleStart}
      className="font-mono hover:bg-muted rounded px-1.5 py-0.5 transition-colors cursor-text"
    >
      {formatTime(value)}
    </button>
  );
}
