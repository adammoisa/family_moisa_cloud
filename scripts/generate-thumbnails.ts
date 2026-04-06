import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, relative, extname, basename } from "path";
import { MEDIA_EXTENSIONS, SKIP_FILES, SKIP_EXTENSIONS } from "../src/lib/constants";

// ─── Config ──────────────────────────────────────────────

const LOCAL_BASE = "/Users/adammoisa/Desktop/Spaces Backup/moisa-personal/Family";
const INPUT_DIR = join(LOCAL_BASE, "family.moisa.cloud/input");
const MEDIA_THUMBS_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/thumbs");
const MEDIA_SMALL_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/small");
const S3_THUMBS_PREFIX = "Family/family.moisa.cloud/media/thumbs";
const S3_SMALL_PREFIX = "Family/family.moisa.cloud/media/small";

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

// ─── Walk and find photos missing thumbnails ─────────────

function findPhotosMissingThumbs(dir: string): string[] {
  const missing: string[] = [];

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_FILES.has(entry.name)) continue;

      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;
        if (!MEDIA_EXTENSIONS.photo.has(ext)) continue;

        const relPath = relative(INPUT_DIR, fullPath);
        const thumbPath = join(MEDIA_THUMBS_DIR, relPath);
        if (!existsSync(thumbPath)) {
          missing.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return missing;
}

// ─── Generate and upload ─────────────────────────────────

async function generateAndUpload(filePath: string): Promise<boolean> {
  const relPath = relative(INPUT_DIR, filePath);

  try {
    const inputBuffer = readFileSync(filePath);

    // Generate thumbnail (120x120, cover crop)
    const thumbBuffer = await sharp(inputBuffer)
      .resize(120, 120, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();

    // Generate small version (400px wide, maintain aspect)
    const smallBuffer = await sharp(inputBuffer)
      .resize(400, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    // Upload thumbnail to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${S3_THUMBS_PREFIX}/${relPath}`,
        Body: thumbBuffer,
        ContentType: "image/jpeg",
      })
    );

    // Upload small version to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${S3_SMALL_PREFIX}/${relPath}`,
        Body: smallBuffer,
        ContentType: "image/jpeg",
      })
    );

    return true;
  } catch (e: any) {
    console.error(`  Failed: ${relPath} - ${e.message}`);
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  if (!process.env.WASABI_ACCESS_KEY_ID) {
    console.error("WASABI_ACCESS_KEY_ID is required. Set it in .env.local");
    process.exit(1);
  }

  console.log("Scanning for photos missing thumbnails...");
  const missing = findPhotosMissingThumbs(INPUT_DIR);
  console.log(`Found ${missing.length} photos without thumbnails`);

  if (missing.length === 0) {
    console.log("All photos have thumbnails!");
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const ok = await generateAndUpload(missing[i]);
    if (ok) success++;
    else failed++;

    if ((i + 1) % 50 === 0 || i === missing.length - 1) {
      console.log(
        `  Progress: ${i + 1}/${missing.length} (${success} success, ${failed} failed)`
      );
    }
  }

  console.log(
    `\nDone! Generated ${success} thumbnails, ${failed} failed.`
  );
}

main().catch((e) => {
  console.error("Thumbnail generation failed:", e);
  process.exit(1);
});
