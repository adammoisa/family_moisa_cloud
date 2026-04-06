"use client";

interface VideoPlayerProps {
  src: string;
  poster?: string;
}

export function VideoPlayer({ src, poster }: VideoPlayerProps) {
  return (
    <video
      controls
      autoPlay
      playsInline
      poster={poster}
      className="max-h-[calc(100vh-10rem)] max-w-full"
    >
      <source src={src} />
      Your browser does not support the video tag.
    </video>
  );
}
