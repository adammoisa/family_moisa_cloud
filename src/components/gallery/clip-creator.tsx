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
  clipId?: string; // If editing an existing clip
  onClose: () => void;
  onDeleted?: () => void; // Called after delete to close parent viewer too
}

export function ClipCreator({ mediaId, videoUrl, videoTitle, clipId, onClose, onDeleted }: ClipCreatorProps) {
  const isEditing = !!clipId;
  const { data: existingClip } = trpc.clips.getById.useQuery(
    { id: clipId! },
    { enabled: isEditing }
  );
  const [initialized, setInitialized] = useState(!isEditing);

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

  // Zoom: viewStart/viewEnd define the visible time range
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0); // 0 = full duration (set on load)

  // Pre-populate from existing clip
  useEffect(() => {
    if (existingClip && !initialized) {
      setTitle(existingClip.title);
      setDescription(existingClip.description || "");
      setStartTime(existingClip.startTime);
      setEndTime(existingClip.endTime);
      setPeopleInput(
        existingClip.tags
          .filter((t) => t.category === "person")
          .map((t) => t.name)
          .join(", ")
      );
      setTagInput(
        existingClip.tags
          .filter((t) => t.category !== "person")
          .map((t) => t.name)
          .join(", ")
      );
      setInitialized(true);
      if (videoRef.current) videoRef.current.currentTime = existingClip.startTime;
    }
  }, [existingClip, initialized]);

  const utils = trpc.useUtils();
  const createClip = trpc.clips.create.useMutation({
    onSuccess: () => {
      utils.clips.list.invalidate();
      utils.clips.getById.invalidate();
      setSaved(true);
      setSaving(false);
    },
    onError: () => setSaving(false),
  });
  const updateClip = trpc.clips.update.useMutation({
    onSuccess: () => {
      utils.clips.list.invalidate();
      utils.clips.getById.invalidate();
      setSaved(true);
      setSaving(false);
    },
    onError: () => setSaving(false),
  });
  const deleteClip = trpc.clips.delete.useMutation({
    onSuccess: () => {
      utils.clips.list.invalidate();
      onClose();
      onDeleted?.();
    },
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      const dur = videoRef.current.duration;
      setDuration(dur);
      setViewEnd(dur);
      setEndTime(Math.min(30, dur));
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

  // Zoom helpers
  const vStart = viewStart;
  const vEnd = viewEnd || duration;
  const vDuration = vEnd - vStart;

  const zoomToSelection = () => {
    const pad = Math.max((endTime - startTime) * 2, 10);
    setViewStart(Math.max(0, startTime - pad));
    setViewEnd(Math.min(duration, endTime + pad));
  };

  const zoomIn = () => {
    const center = (vStart + vEnd) / 2;
    const half = vDuration / 4;
    setViewStart(Math.max(0, center - half));
    setViewEnd(Math.min(duration, center + half));
  };

  const zoomOut = () => {
    const center = (vStart + vEnd) / 2;
    const half = vDuration;
    setViewStart(Math.max(0, center - half));
    setViewEnd(Math.min(duration, center + half));
  };

  const zoomReset = () => {
    setViewStart(0);
    setViewEnd(duration);
  };

  // Timeline drag handling (uses zoom view range)
  const getTimeFromX = useCallback((clientX: number) => {
    if (!timelineRef.current || vDuration === 0) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return vStart + pct * vDuration;
  }, [vStart, vDuration]);

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
    const payload = {
      mediaId,
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: Math.round(startTime),
      endTime: Math.round(endTime),
      tagNames: tagInput.split(",").map((t) => t.trim()).filter(Boolean),
      people: peopleInput.split(",").map((p) => p.trim()).filter(Boolean),
    };
    if (isEditing && clipId) {
      await updateClip.mutateAsync({ id: clipId, ...payload });
    } else {
      await createClip.mutateAsync(payload);
    }
  };

  const handleDelete = () => {
    if (clipId) deleteClip.mutate({ id: clipId });
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const pct = (t: number) => vDuration > 0 ? `${((t - vStart) / vDuration) * 100}%` : "0%";

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
          <span className="text-sm font-medium">{isEditing ? "Edit Clip" : "Create Clip"}</span>
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
              <span className="text-xs font-mono text-muted-foreground">{formatTime(vStart)}</span>
              <span className="text-xs font-mono text-primary">
                {formatTime(currentTime)} &middot; Clip: {formatTime(startTime)} - {formatTime(endTime)} ({formatTime(endTime - startTime)})
              </span>
              <span className="text-xs font-mono text-muted-foreground">{formatTime(vEnd)}</span>
            </div>

            {/* Timeline bar */}
            <div
              ref={timelineRef}
              className="relative h-10 bg-muted rounded cursor-pointer select-none overflow-hidden"
              onClick={handleTimelineClick}
              onWheel={(e) => {
                e.preventDefault();
                const mouseTime = getTimeFromX(e.clientX);
                const factor = e.deltaY > 0 ? 1.3 : 0.7;
                const newDur = Math.max(5, Math.min(duration, vDuration * factor));
                const ratio = (mouseTime - vStart) / vDuration;
                const newStart = Math.max(0, mouseTime - ratio * newDur);
                const newEnd = Math.min(duration, newStart + newDur);
                setViewStart(newStart);
                setViewEnd(newEnd);
              }}
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

            {/* Playback + zoom controls */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={zoomIn} className="text-xs px-2" title="Zoom in">
                  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" onClick={zoomOut} className="text-xs px-2" title="Zoom out">
                  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                  </svg>
                </Button>
                <Button variant="ghost" size="sm" onClick={zoomToSelection} className="text-xs px-2" title="Zoom to clip">
                  Fit
                </Button>
                <Button variant="ghost" size="sm" onClick={zoomReset} className="text-xs px-2" title="Show full video">
                  All
                </Button>
                <span className="text-[10px] text-muted-foreground font-mono ml-1">
                  {Math.round(duration / vDuration)}x
                </span>
              </div>
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
          <div className="p-4 border-t space-y-2">
            {saved ? (
              <div className="text-center space-y-2">
                <p className="text-sm text-green-500 font-medium">
                  {isEditing ? "Clip updated!" : "Clip created!"}
                </p>
                <div className="flex gap-2">
                  {!isEditing && (
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                      setSaved(false);
                      setTitle("");
                      setDescription("");
                      setTagInput("");
                      setPeopleInput("");
                    }}>
                      Create another
                    </Button>
                  )}
                  <Button size="sm" className="flex-1" onClick={onClose}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={!title.trim() || endTime <= startTime || saving}
                >
                  {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Clip"}
                </Button>
                {isEditing && (
                  showDeleteConfirm ? (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        onClick={handleDelete}
                      >
                        Confirm Delete
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete Clip
                    </Button>
                  )
                )}
              </>
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
