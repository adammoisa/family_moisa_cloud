import { NextResponse } from "next/server";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { clips, media } from "@/db/schema";
import { generateSignedUrl } from "@/server/services/s3";

export const runtime = "nodejs";
export const maxDuration = 300;

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9\-_. ]/gi, "_").slice(0, 120) || "clip";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ clip: clips, media })
    .from(clips)
    .innerJoin(media, eq(clips.mediaId, media.id))
    .where(eq(clips.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sourceUrl = await generateSignedUrl(row.media.s3Key, 600);
  const duration = Math.max(0.1, row.clip.endTime - row.clip.startTime);

  if (!ffmpegPath) {
    return NextResponse.json({ error: "ffmpeg missing" }, { status: 500 });
  }

  const ff = spawn(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(row.clip.startTime),
      "-i", sourceUrl,
      "-t", String(duration),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-f", "mp4",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let stderr = "";
  ff.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  ff.on("error", (err) => {
    console.error("ffmpeg spawn error:", err);
  });
  ff.on("close", (code) => {
    if (code !== 0) console.error(`ffmpeg exited ${code}: ${stderr}`);
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ff.stdout.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      ff.stdout.on("end", () => controller.close());
      ff.stdout.on("error", (err) => controller.error(err));
    },
    cancel() {
      ff.kill("SIGKILL");
    },
  });

  const filename = `${sanitizeFilename(row.clip.title)}.mp4`;

  return new Response(stream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
