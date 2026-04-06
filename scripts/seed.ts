import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readdirSync, statSync, existsSync } from "fs";
import { join, relative, extname, basename } from "path";
import * as schema from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  extractTags,
  getMediaType,
  shouldSkipFile,
  cleanTitle,
  makeSlug,
  getMimeType,
  type ExtractedTag,
} from "./extract-metadata";

// ─── Config ──────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const LOCAL_BASE = "/Users/adammoisa/Desktop/Spaces Backup/moisa-personal/Family";
const INPUT_DIR = join(LOCAL_BASE, "family.moisa.cloud/input");
const MEDIA_THUMBS_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/thumbs");
const MEDIA_SMALL_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/small");
const S3_PREFIX = "Family/family.moisa.cloud/input";
const S3_THUMBS_PREFIX = "Family/family.moisa.cloud/media/thumbs";
const S3_SMALL_PREFIX = "Family/family.moisa.cloud/media/small";

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1, prepare: false });
const db = drizzle(sql, { schema });

// ─── Types ───────────────────────────────────────────────

interface AlbumData {
  id?: string;
  slug: string;
  title: string;
  parentId: string | null;
  s3Prefix: string;
  sortOrder: number;
}

interface MediaData {
  albumId: string;
  type: "photo" | "video";
  s3Key: string;
  thumbnailS3Key: string | null;
  smallS3Key: string | null;
  filename: string;
  title: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  searchText: string;
  tags: ExtractedTag[];
}

// ─── Seed Logic ──────────────────────────────────────────

const albumSlugs = new Set<string>();
const tagCache = new Map<string, string>(); // "category:name" -> tagId

async function getOrCreateTag(
  name: string,
  category: ExtractedTag["category"]
): Promise<string> {
  const cacheKey = `${category}:${name.toLowerCase()}`;
  if (tagCache.has(cacheKey)) return tagCache.get(cacheKey)!;

  const slug = makeSlug(name, new Set());
  const existing = await db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.slug, slug))
    .limit(1);

  if (existing[0]) {
    tagCache.set(cacheKey, existing[0].id);
    return existing[0].id;
  }

  const [created] = await db
    .insert(schema.tags)
    .values({ name, slug, category })
    .returning();

  tagCache.set(cacheKey, created.id);
  return created.id;
}

function walkDirectory(
  dir: string,
  parentAlbumTitle: string = ""
): { albums: AlbumData[]; mediaFiles: { path: string; albumTitle: string }[] } {
  const albums: AlbumData[] = [];
  const mediaFiles: { path: string; albumTitle: string }[] = [];

  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  let sortOrder = 0;
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "Thumbs.db") continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const relPath = relative(INPUT_DIR, fullPath);
      const s3Prefix = `${S3_PREFIX}/${relPath}`;
      const title = entry.name;
      const slug = makeSlug(
        parentAlbumTitle ? `${parentAlbumTitle} ${title}` : title,
        albumSlugs
      );

      albums.push({
        slug,
        title,
        parentId: null, // Will be set later
        s3Prefix,
        sortOrder: sortOrder++,
      });

      // Recurse
      const sub = walkDirectory(fullPath, title);
      // Mark child albums as children of this one
      for (const childAlbum of sub.albums) {
        childAlbum.parentId = slug; // Temp: use parent slug, resolve to ID later
      }
      albums.push(...sub.albums);
      mediaFiles.push(...sub.mediaFiles);
    } else if (entry.isFile()) {
      if (shouldSkipFile(entry.name)) continue;
      const type = getMediaType(entry.name);
      if (!type) continue;

      mediaFiles.push({
        path: fullPath,
        albumTitle: parentAlbumTitle || basename(dir),
      });
    }
  }

  return { albums, mediaFiles };
}

async function seed() {
  console.log("Starting seed...");
  console.log(`Input directory: ${INPUT_DIR}`);

  if (!existsSync(INPUT_DIR)) {
    console.error(`Input directory not found: ${INPUT_DIR}`);
    process.exit(1);
  }

  // ─── Step 1: Walk filesystem ─────────────────────────

  console.log("Walking filesystem...");
  const { albums: albumData, mediaFiles } = walkDirectory(INPUT_DIR);

  // Also collect root-level media files (VHS tapes, etc.)
  const rootFiles = readdirSync(INPUT_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !shouldSkipFile(e.name) && getMediaType(e.name))
    .map((e) => ({
      path: join(INPUT_DIR, e.name),
      albumTitle: "Family Home Videos",
    }));

  // Add a root album for loose files if any exist
  if (rootFiles.length > 0) {
    albumData.unshift({
      slug: makeSlug("Family Home Videos", albumSlugs),
      title: "Family Home Videos",
      parentId: null,
      s3Prefix: S3_PREFIX,
      sortOrder: -1,
    });
  }

  console.log(`Found ${albumData.length} albums, ${mediaFiles.length + rootFiles.length} media files`);

  // ─── Step 2: Create albums ───────────────────────────

  console.log("Creating albums...");
  const albumIdMap = new Map<string, string>(); // slug -> id

  // First pass: create albums without parent references
  for (const album of albumData) {
    const [created] = await db
      .insert(schema.albums)
      .values({
        slug: album.slug,
        title: album.title,
        parentId: null,
        s3Prefix: album.s3Prefix,
        sortOrder: album.sortOrder,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      albumIdMap.set(album.slug, created.id);
    } else {
      // Already exists, get ID
      const existing = await db
        .select()
        .from(schema.albums)
        .where(eq(schema.albums.slug, album.slug))
        .limit(1);
      if (existing[0]) albumIdMap.set(album.slug, existing[0].id);
    }
  }

  // Second pass: set parent IDs
  for (const album of albumData) {
    if (album.parentId && albumIdMap.has(album.parentId)) {
      const albumId = albumIdMap.get(album.slug);
      const parentId = albumIdMap.get(album.parentId);
      if (albumId && parentId) {
        await db
          .update(schema.albums)
          .set({ parentId })
          .where(eq(schema.albums.id, albumId));
      }
    }
  }

  // ─── Step 3: Create media records ────────────────────

  console.log("Creating media records...");
  const allFiles = [...mediaFiles, ...rootFiles];
  let created = 0;
  let skipped = 0;

  for (const file of allFiles) {
    const filename = basename(file.path);
    const type = getMediaType(filename);
    if (!type) continue;

    const relPath = relative(INPUT_DIR, file.path);
    const s3Key = `${S3_PREFIX}/${relPath}`;
    const dirName = relative(INPUT_DIR, join(file.path, ".."));

    // Find the album for this file
    const albumSlug = albumData.find((a) => {
      const albumRelPath = relative(INPUT_DIR, file.path);
      const albumDir = albumRelPath.substring(
        0,
        albumRelPath.lastIndexOf("/")
      );
      return a.s3Prefix === `${S3_PREFIX}/${albumDir}` || a.s3Prefix === `${S3_PREFIX}`;
    })?.slug;

    const albumId = albumSlug ? albumIdMap.get(albumSlug) : undefined;
    if (!albumId) {
      // Fallback: find parent dir album
      const parentDir = dirName || "";
      const fallbackAlbum = albumData.find(
        (a) =>
          a.s3Prefix === `${S3_PREFIX}/${parentDir}` ||
          (parentDir === "" && a.title === "Family Home Videos")
      );
      if (!fallbackAlbum || !albumIdMap.has(fallbackAlbum.slug)) {
        skipped++;
        continue;
      }
    }

    const finalAlbumId = albumId || albumIdMap.get(
      albumData.find(
        (a) =>
          a.s3Prefix === `${S3_PREFIX}/${dirName}` ||
          (dirName === "" && a.title === "Family Home Videos")
      )?.slug || ""
    );

    if (!finalAlbumId) {
      skipped++;
      continue;
    }

    // Check for thumbnails
    const thumbPath = join(MEDIA_THUMBS_DIR, relPath);
    const smallPath = join(MEDIA_SMALL_DIR, relPath);
    const thumbnailS3Key = existsSync(thumbPath)
      ? `${S3_THUMBS_PREFIX}/${relPath}`
      : null;
    const smallS3Key = existsSync(smallPath)
      ? `${S3_SMALL_PREFIX}/${relPath}`
      : null;

    const title = cleanTitle(filename);
    const fileTags = extractTags(filename, dirName);
    const stats = statSync(file.path);

    // Build search text
    const albumTitle =
      albumData.find((a) => albumIdMap.get(a.slug) === finalAlbumId)?.title ||
      "";
    const tagNames = fileTags.map((t) => t.name).join(" ");
    const searchText = `${title} ${albumTitle} ${tagNames} ${filename}`.trim();

    try {
      const [mediaRecord] = await db
        .insert(schema.media)
        .values({
          albumId: finalAlbumId,
          type,
          s3Key,
          thumbnailS3Key,
          smallS3Key,
          filename,
          title,
          mimeType: getMimeType(filename),
          fileSize: stats.size,
          sortOrder: created,
          searchText,
        })
        .onConflictDoNothing()
        .returning();

      if (mediaRecord) {
        created++;

        // Create tag associations
        for (const tag of fileTags) {
          const tagId = await getOrCreateTag(tag.name, tag.category);
          await db
            .insert(schema.mediaTags)
            .values({ mediaId: mediaRecord.id, tagId })
            .onConflictDoNothing();
        }

        // Also tag the album
        for (const tag of fileTags) {
          const tagId = await getOrCreateTag(tag.name, tag.category);
          await db
            .insert(schema.albumTags)
            .values({ albumId: finalAlbumId, tagId })
            .onConflictDoNothing();
        }
      } else {
        skipped++;
      }
    } catch (e: any) {
      if (e.message?.includes("unique")) {
        skipped++;
      } else {
        console.error(`Error processing ${filename}:`, e.message);
      }
    }

    if ((created + skipped) % 100 === 0) {
      console.log(
        `  Progress: ${created} created, ${skipped} skipped of ${allFiles.length}`
      );
    }
  }

  // ─── Step 4: Update album metadata ───────────────────

  console.log("Updating album metadata...");
  for (const [slug, albumId] of albumIdMap) {
    // Count media
    const mediaItems = await db
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(eq(schema.media.albumId, albumId));

    // Set first photo as cover
    const firstPhoto = await db
      .select()
      .from(schema.media)
      .where(eq(schema.media.albumId, albumId))
      .limit(1);

    await db
      .update(schema.albums)
      .set({
        mediaCount: mediaItems.length,
        coverMediaId: firstPhoto[0]?.id ?? null,
      })
      .where(eq(schema.albums.id, albumId));
  }

  // ─── Step 5: Sync whitelist from env ─────────────────

  const whitelistEmails = process.env.WHITELIST_EMAILS;
  if (whitelistEmails) {
    console.log("Syncing email whitelist...");
    const emails = whitelistEmails
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    for (const email of emails) {
      await db
        .insert(schema.emailWhitelist)
        .values({ email })
        .onConflictDoNothing();
    }
    console.log(`  Whitelist: ${emails.length} emails synced`);
  }

  // ─── Done ────────────────────────────────────────────

  console.log(
    `\nSeed complete! ${created} media items created, ${skipped} skipped.`
  );
  console.log(`${albumIdMap.size} albums, ${tagCache.size} tags`);

  await sql.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
