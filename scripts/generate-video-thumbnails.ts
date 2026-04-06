import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import postgres from "postgres";

// ─── Config ──────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
if (!process.env.WASABI_ACCESS_KEY_ID) { console.error("WASABI_ACCESS_KEY_ID required"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1, prepare: false });

const s3 = new S3Client({
  region: process.env.WASABI_REGION || "us-east-1",
  endpoint: process.env.WASABI_ENDPOINT || "https://s3.us-east-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});
const BUCKET = process.env.WASABI_BUCKET || "moisa-personal";

const LOCAL_BASE = "/Users/adammoisa/Desktop/Spaces Backup/moisa-personal/Family";
const INPUT_DIR = join(LOCAL_BASE, "family.moisa.cloud/input");
const S3_FRAMES_PREFIX = "Family/family.moisa.cloud/media/frames";
const TMP_DIR = "/tmp/video-thumbnails";
const NUM_FRAMES = 5;

// ─── Helpers ─────────────────────────────────────────────

function getVideoDuration(filePath: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

function extractFrame(filePath: string, timestamp: number, outputPath: string): boolean {
  try {
    execSync(
      `ffmpeg -y -ss ${timestamp} -i "${filePath}" -vframes 1 -q:v 3 -vf "scale=400:-1" "${outputPath}" 2>/dev/null`,
      { timeout: 30000 }
    );
    return existsSync(outputPath);
  } catch {
    return false;
  }
}

async function uploadToS3(localPath: string, s3Key: string): Promise<boolean> {
  try {
    const body = readFileSync(localPath);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: "image/jpeg",
    }));
    return true;
  } catch (e: any) {
    console.error(`  Upload failed: ${e.message}`);
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  mkdirSync(TMP_DIR, { recursive: true });

  // Get all videos without thumbnail frames
  const videos = await sql`
    SELECT id, s3_key, filename
    FROM media
    WHERE type = 'video'
    AND (thumbnail_frames IS NULL OR thumbnail_frames = '[]')
  `;

  console.log(`Found ${videos.length} videos needing thumbnails`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const s3Key = video.s3_key as string;
    const filename = video.filename as string;

    // Derive local path from S3 key
    const relPath = s3Key.replace("Family/family.moisa.cloud/input/", "");
    const localPath = join(INPUT_DIR, relPath);

    if (!existsSync(localPath)) {
      console.log(`  [${i + 1}/${videos.length}] Skip: ${filename} (file not found locally)`);
      failed++;
      continue;
    }

    console.log(`  [${i + 1}/${videos.length}] Processing: ${filename}`);

    const duration = getVideoDuration(localPath);
    if (duration <= 0) {
      console.log(`    Could not get duration, skipping`);
      failed++;
      continue;
    }

    // Calculate timestamps: evenly spaced, avoiding very start/end
    const frameKeys: string[] = [];
    const timestamps: number[] = [];
    for (let f = 0; f < NUM_FRAMES; f++) {
      const pct = (f + 1) / (NUM_FRAMES + 1);
      timestamps.push(Math.floor(duration * pct));
    }

    let allFramesOk = true;
    for (let f = 0; f < timestamps.length; f++) {
      const tmpPath = join(TMP_DIR, `frame_${i}_${f}.jpg`);
      const s3FrameKey = `${S3_FRAMES_PREFIX}/${relPath.replace(/\.[^.]+$/, "")}_frame${f}.jpg`;

      if (extractFrame(localPath, timestamps[f], tmpPath)) {
        if (await uploadToS3(tmpPath, s3FrameKey)) {
          frameKeys.push(s3FrameKey);
        } else {
          allFramesOk = false;
        }
        try { unlinkSync(tmpPath); } catch {}
      } else {
        allFramesOk = false;
      }
    }

    if (frameKeys.length > 0) {
      // Also set the first frame as the main thumbnail
      const framesJson = JSON.stringify(frameKeys);
      await sql`
        UPDATE media
        SET thumbnail_frames = ${framesJson}::jsonb,
            thumbnail_s3_key = ${frameKeys[0]}
        WHERE id = ${video.id as string}
      `;
      success++;
      console.log(`    Generated ${frameKeys.length} frames`);
    } else {
      failed++;
      console.log(`    Failed to generate any frames`);
    }
  }

  console.log(`\nDone! ${success} videos thumbnailed, ${failed} failed.`);

  // Cleanup
  try { execSync(`rm -rf ${TMP_DIR}`); } catch {}
  await sql.end();
}

main().catch((e) => {
  console.error("Video thumbnail generation failed:", e);
  process.exit(1);
});
