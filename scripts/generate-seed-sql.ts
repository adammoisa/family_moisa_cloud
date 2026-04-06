import { readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { join, relative, basename } from "path";
import slugifyLib from "slugify";

// ─── Constants (inline to avoid import path issues) ──────

const KNOWN_PEOPLE = ["Avi","Batya","David","Babi-Iancu","Babi","Iancu","Yehudah","Yehudit","Elisabeth Bura","Mema","Paul","Morgan","Robert","Sharon","Tara","Rabbi Malin","Moishe","Basi"];
const KNOWN_LOCATIONS = ["Israel","Kotel","Ein Gedi","Massada","Dead Sea","Chelsea Piers","Deal NJ","Deal, NJ","Mt Scopus","Har HaZeisim","Meah Shearim","Tzefat","Amuka","Meron","Tiveria","Rosh Hanikra","Acco","Tel Aviv","Bronx Zoo","Puerto Rico","Florida","EPCOT","Universal","Shaalvim","Yad Vashem","Golan","Cardo","Shaar Yaffo"];
const KNOWN_EVENTS = ["Succot","Chanuka","Chanukah","Purim","Pesach","Graduation","Bris","Upshiring","Upsheiring","Bar Mitzvah","Karate","Gymnastics","Camp","Siddur Party","Chumash Party","Vach Nacht","Shoah","Simchat Beit Hashoeva","Simchas Bais Hashoeva","Slichos","Yom Kippur"];

const PHOTO_EXTS = new Set([".jpg",".jpeg",".png",".tif",".tiff",".gif",".heic",".webp"]);
const VIDEO_EXTS = new Set([".mp4",".mov",".avi",".mkv",".webm"]);
const SKIP_EXTS = new Set([".db",".html",".htm",".css",".js",".wav",".woff",".ttf",".eot"]);
const SKIP_FILES = new Set([".DS_Store","Thumbs.db","desktop.ini"]);

const LOCAL_BASE = "/Users/adammoisa/Desktop/Spaces Backup/moisa-personal/Family";
const INPUT_DIR = join(LOCAL_BASE, "family.moisa.cloud/input");
const THUMBS_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/thumbs");
const SMALL_DIR = join(LOCAL_BASE, "family.moisa.cloud/media/small");
const S3_INPUT = "Family/family.moisa.cloud/input";
const S3_THUMBS = "Family/family.moisa.cloud/media/thumbs";
const S3_SMALL = "Family/family.moisa.cloud/media/small";
const OUT_DIR = join(import.meta.dir, "seed-sql");

// ─── Helpers ─────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function slugify(s: string): string {
  return slugifyLib(s, { lower: true, strict: true, trim: true }) || "untitled";
}

const usedSlugs = new Set<string>();
function uniqueSlug(base: string): string {
  let s = slugify(base);
  let i = 1;
  while (usedSlugs.has(s)) { s = `${slugify(base)}-${i++}`; }
  usedSlugs.add(s);
  return s;
}

function getType(f: string): "photo"|"video"|null {
  const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
  if (PHOTO_EXTS.has(ext)) return "photo";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

function shouldSkip(f: string): boolean {
  if (SKIP_FILES.has(f) || f.startsWith(".")) return true;
  const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
  return SKIP_EXTS.has(ext);
}

function getMime(f: string): string {
  const ext = f.substring(f.lastIndexOf(".")).toLowerCase();
  const m: Record<string,string> = {".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".gif":"image/gif",".tif":"image/tiff",".tiff":"image/tiff",".mp4":"video/mp4",".mov":"video/quicktime",".avi":"video/x-msvideo"};
  return m[ext] || "application/octet-stream";
}

function extractTags(filename: string, dirPath: string): {name:string,category:string}[] {
  const combined = `${dirPath} ${filename}`.toLowerCase();
  const tags: {name:string,category:string}[] = [];
  const seen = new Set<string>();
  function add(name: string, cat: string) {
    const k = `${cat}:${name.toLowerCase()}`;
    if (!seen.has(k)) { seen.add(k); tags.push({name, category: cat}); }
  }
  for (const p of KNOWN_PEOPLE) if (combined.includes(p.toLowerCase())) add(p, "person");
  for (const l of KNOWN_LOCATIONS) if (combined.includes(l.toLowerCase())) add(l, "location");
  for (const e of KNOWN_EVENTS) if (combined.includes(e.toLowerCase())) add(e, "event");
  const years = combined.match(/\b(19[89]\d|20[012]\d)\b/g);
  if (years) for (const y of [...new Set(years)]) add(y, "year");
  const datePats = combined.match(/\b(\d{1,2})-(\d{2})\b/g);
  if (datePats) for (const dp of datePats) {
    const [,yp] = dp.split("-");
    const yn = parseInt(yp, 10);
    if (yn >= 0 && yn <= 25) add(yn >= 80 ? `19${yp}` : `20${yp}`, "year");
  }
  return tags;
}

function cleanTitle(f: string): string {
  let t = f.replace(/\.[^.]+$/, "").replace(/^(IMGP|IMG_|DSC_|DSCF|DSCN|P)\d+\s*/, "").replace(/_/g, " ").trim();
  return t || f;
}

// ─── Walk filesystem ─────────────────────────────────────

interface Album { slug: string; title: string; parentSlug: string|null; s3Prefix: string; sortOrder: number; }
interface Media { albumSlug: string; type: "photo"|"video"; s3Key: string; thumbKey: string|null; smallKey: string|null; filename: string; title: string; mime: string; size: number; sortOrder: number; searchText: string; tags: {name:string,category:string}[]; }

const albums: Album[] = [];
const mediaItems: Media[] = [];
let mediaSortCounter = 0;

function walk(dir: string, parentSlug: string|null, parentTitle: string) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name));
  let albumSort = 0;

  // Collect files at this level
  const files = entries.filter(e => e.isFile() && !shouldSkip(e.name) && getType(e.name));
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "Thumbs.db");

  // If this dir has files or subdirs, and it's not the root input dir (handled separately)
  for (const d of dirs) {
    const fullPath = join(dir, d.name);
    const slug = uniqueSlug(parentTitle ? `${parentTitle}-${d.name}` : d.name);
    const relPath = relative(INPUT_DIR, fullPath);
    const s3Prefix = `${S3_INPUT}/${relPath}`;

    albums.push({ slug, title: d.name, parentSlug: parentSlug, s3Prefix, sortOrder: albumSort++ });

    // Process files in this subdirectory
    const subFiles = readdirSync(fullPath, { withFileTypes: true })
      .filter(e => e.isFile() && !shouldSkip(e.name) && getType(e.name))
      .sort((a,b) => a.name.localeCompare(b.name));

    for (const f of subFiles) {
      const filePath = join(fullPath, f.name);
      const relFile = relative(INPUT_DIR, filePath);
      const type = getType(f.name)!;
      const thumbExists = existsSync(join(THUMBS_DIR, relFile));
      const smallExists = existsSync(join(SMALL_DIR, relFile));
      const title = cleanTitle(f.name);
      const tags = extractTags(f.name, relPath);
      const tagNames = tags.map(t => t.name).join(" ");

      mediaItems.push({
        albumSlug: slug,
        type,
        s3Key: `${S3_INPUT}/${relFile}`,
        thumbKey: thumbExists ? `${S3_THUMBS}/${relFile}` : null,
        smallKey: smallExists ? `${S3_SMALL}/${relFile}` : null,
        filename: f.name,
        title,
        mime: getMime(f.name),
        size: statSync(filePath).size,
        sortOrder: mediaSortCounter++,
        searchText: `${title} ${d.name} ${tagNames} ${f.name}`,
        tags,
      });
    }

    // Recurse into subdirectories
    walk(fullPath, slug, d.name);
  }

  return files;
}

// ─── Main ────────────────────────────────────────────────

console.log("Scanning filesystem...");
const rootFiles = walk(INPUT_DIR, null, "");

// Handle root-level files (VHS tapes etc)
const rootMediaFiles = readdirSync(INPUT_DIR, { withFileTypes: true })
  .filter(e => e.isFile() && !shouldSkip(e.name) && getType(e.name))
  .sort((a,b) => a.name.localeCompare(b.name));

if (rootMediaFiles.length > 0) {
  const rootSlug = uniqueSlug("family-home-videos");
  albums.unshift({ slug: rootSlug, title: "Family Home Videos", parentSlug: null, s3Prefix: S3_INPUT, sortOrder: -1 });

  for (const f of rootMediaFiles) {
    const type = getType(f.name)!;
    const title = cleanTitle(f.name);
    const tags = extractTags(f.name, "");
    const filePath = join(INPUT_DIR, f.name);

    mediaItems.push({
      albumSlug: rootSlug,
      type,
      s3Key: `${S3_INPUT}/${f.name}`,
      thumbKey: null,
      smallKey: null,
      filename: f.name,
      title,
      mime: getMime(f.name),
      size: statSync(filePath).size,
      sortOrder: mediaSortCounter++,
      searchText: `${title} Family Home Videos ${tags.map(t=>t.name).join(" ")} ${f.name}`,
      tags,
    });
  }
}

console.log(`Found ${albums.length} albums, ${mediaItems.length} media files`);

// ─── Generate SQL ────────────────────────────────────────

// Collect all unique tags
const allTags = new Map<string, {name:string,category:string,slug:string}>();
for (const m of mediaItems) {
  for (const t of m.tags) {
    const key = `${t.category}:${t.name.toLowerCase()}`;
    if (!allTags.has(key)) {
      allTags.set(key, { name: t.name, category: t.category, slug: slugify(t.name) });
    }
  }
}

// SQL 1: Tags
let sql1 = "-- Tags\n";
for (const [key, t] of allTags) {
  sql1 += `INSERT INTO tags (name, slug, category) VALUES ('${esc(t.name)}', '${esc(t.slug)}', '${t.category}') ON CONFLICT DO NOTHING;\n`;
}

// SQL 2: Albums
let sql2 = "-- Albums (no parents first)\n";
for (const a of albums) {
  sql2 += `INSERT INTO albums (slug, title, s3_prefix, sort_order) VALUES ('${esc(a.slug)}', '${esc(a.title)}', '${esc(a.s3Prefix)}', ${a.sortOrder}) ON CONFLICT DO NOTHING;\n`;
}

// SQL 3: Album parent relationships
let sql3 = "-- Album parent relationships\n";
for (const a of albums) {
  if (a.parentSlug) {
    sql3 += `UPDATE albums SET parent_id = (SELECT id FROM albums WHERE slug = '${esc(a.parentSlug)}') WHERE slug = '${esc(a.slug)}';\n`;
  }
}

// SQL 4+: Media (batched)
const BATCH_SIZE = 200;
const mediaBatches: string[] = [];
for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
  const batch = mediaItems.slice(i, i + BATCH_SIZE);
  let batchSql = `-- Media batch ${Math.floor(i/BATCH_SIZE) + 1}\n`;
  for (const m of batch) {
    batchSql += `INSERT INTO media (album_id, type, s3_key, thumbnail_s3_key, small_s3_key, filename, title, mime_type, file_size, sort_order, search_text) VALUES ((SELECT id FROM albums WHERE slug = '${esc(m.albumSlug)}'), '${m.type}', '${esc(m.s3Key)}', ${m.thumbKey ? `'${esc(m.thumbKey)}'` : 'NULL'}, ${m.smallKey ? `'${esc(m.smallKey)}'` : 'NULL'}, '${esc(m.filename)}', '${esc(m.title)}', '${m.mime}', ${m.size}, ${m.sortOrder}, '${esc(m.searchText)}') ON CONFLICT DO NOTHING;\n`;
  }
  mediaBatches.push(batchSql);
}

// SQL: Media tags
const mediaTagBatches: string[] = [];
let tagBatch = "-- Media tags\n";
let tagCount = 0;
for (const m of mediaItems) {
  for (const t of m.tags) {
    const tSlug = slugify(t.name);
    tagBatch += `INSERT INTO media_tags (media_id, tag_id) SELECT m.id, t.id FROM media m, tags t WHERE m.s3_key = '${esc(m.s3Key)}' AND t.slug = '${esc(tSlug)}' AND t.category = '${t.category}' ON CONFLICT DO NOTHING;\n`;
    tagCount++;
    if (tagCount % 300 === 0) {
      mediaTagBatches.push(tagBatch);
      tagBatch = `-- Media tags (cont)\n`;
    }
  }
}
if (tagBatch.length > 30) mediaTagBatches.push(tagBatch);

// SQL: Update album cover and counts
let sqlUpdate = "-- Update album metadata\n";
sqlUpdate += `UPDATE albums SET media_count = (SELECT count(*) FROM media WHERE media.album_id = albums.id), cover_media_id = (SELECT id FROM media WHERE media.album_id = albums.id ORDER BY sort_order LIMIT 1);\n`;

// Write files
const { mkdirSync } = await import("fs");
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(join(OUT_DIR, "01-tags.sql"), sql1);
writeFileSync(join(OUT_DIR, "02-albums.sql"), sql2);
writeFileSync(join(OUT_DIR, "03-album-parents.sql"), sql3);
for (let i = 0; i < mediaBatches.length; i++) {
  writeFileSync(join(OUT_DIR, `04-media-${String(i).padStart(2,"0")}.sql`), mediaBatches[i]);
}
for (let i = 0; i < mediaTagBatches.length; i++) {
  writeFileSync(join(OUT_DIR, `05-media-tags-${String(i).padStart(2,"0")}.sql`), mediaTagBatches[i]);
}
writeFileSync(join(OUT_DIR, "06-update-albums.sql"), sqlUpdate);

console.log(`Generated SQL files in ${OUT_DIR}`);
console.log(`  Tags: ${allTags.size}`);
console.log(`  Albums: ${albums.length}`);
console.log(`  Media batches: ${mediaBatches.length}`);
console.log(`  Tag association batches: ${mediaTagBatches.length}`);
