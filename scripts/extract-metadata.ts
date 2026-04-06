import slugify from "slugify";
import {
  KNOWN_PEOPLE,
  KNOWN_LOCATIONS,
  KNOWN_EVENTS,
  MEDIA_EXTENSIONS,
  SKIP_EXTENSIONS,
  SKIP_FILES,
} from "../src/lib/constants";

export interface ExtractedTag {
  name: string;
  category: "person" | "location" | "event" | "year" | "activity" | "other";
}

export function extractTags(
  filename: string,
  directoryPath: string
): ExtractedTag[] {
  const combined = `${directoryPath} ${filename}`;
  const tags: ExtractedTag[] = [];
  const seen = new Set<string>();

  function addTag(name: string, category: ExtractedTag["category"]) {
    const key = `${category}:${name.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      tags.push({ name, category });
    }
  }

  // People
  for (const person of KNOWN_PEOPLE) {
    if (combined.toLowerCase().includes(person.toLowerCase())) {
      addTag(person, "person");
    }
  }

  // Locations
  for (const loc of KNOWN_LOCATIONS) {
    if (combined.toLowerCase().includes(loc.toLowerCase())) {
      addTag(loc, "location");
    }
  }

  // Events
  for (const event of KNOWN_EVENTS) {
    if (combined.toLowerCase().includes(event.toLowerCase())) {
      addTag(event, "event");
    }
  }

  // Years: 4-digit years 1985-2025
  const yearMatches = combined.match(/\b(19[89]\d|20[012]\d)\b/g);
  if (yearMatches) {
    for (const year of [...new Set(yearMatches)]) {
      addTag(year, "year");
    }
  }

  // Date patterns: "6-04" -> 2004, "12-04" -> 2004, "01-05" -> 2005
  const datePatterns = combined.match(/\b(\d{1,2})-(\d{2})\b/g);
  if (datePatterns) {
    for (const pattern of datePatterns) {
      const [, yearPart] = pattern.split("-");
      const yearNum = parseInt(yearPart, 10);
      if (yearNum >= 0 && yearNum <= 25) {
        const fullYear = yearNum >= 80 ? `19${yearPart}` : `20${yearPart}`;
        addTag(fullYear, "year");
      }
    }
  }

  return tags;
}

export function getMediaType(
  filename: string
): "photo" | "video" | null {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  if (MEDIA_EXTENSIONS.photo.has(ext)) return "photo";
  if (MEDIA_EXTENSIONS.video.has(ext)) return "video";
  return null;
}

export function shouldSkipFile(filename: string): boolean {
  if (SKIP_FILES.has(filename)) return true;
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (filename.startsWith(".")) return true;
  return false;
}

export function cleanTitle(filename: string): string {
  // Remove extension
  let title = filename.replace(/\.[^.]+$/, "");

  // Remove camera prefixes
  title = title.replace(/^(IMGP|IMG_|DSC_|DSCF|DSCN|P)\d+\s*/, "");

  // Clean up remaining
  title = title.replace(/_/g, " ").trim();

  return title || filename;
}

export function makeSlug(title: string, existingSlugs: Set<string>): string {
  let slug = slugify(title, { lower: true, strict: true, trim: true });
  if (!slug) slug = "untitled";

  let finalSlug = slug;
  let counter = 1;
  while (existingSlugs.has(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }
  existingSlugs.add(finalSlug);
  return finalSlug;
}

export function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".heic": "image/heic",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
  };
  return mimeMap[ext] || "application/octet-stream";
}
