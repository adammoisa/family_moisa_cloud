import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1, prepare: false });
const dir = join(import.meta.dir, "seed-sql");

const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
console.log(`Executing ${files.length} SQL files...`);

for (const file of files) {
  console.log(`  ${file}...`);
  const content = readFileSync(join(dir, file), "utf-8");
  // Execute the whole file as one statement
  try {
    await sql.unsafe(content);
    console.log(`    done`);
  } catch (e: any) {
    console.error(`    error: ${e.message.slice(0, 200)}`);
  }
}

// Update album metadata
console.log("Updating album metadata...");
await sql.unsafe(`
  UPDATE albums SET
    media_count = (SELECT count(*) FROM media WHERE media.album_id = albums.id),
    cover_media_id = (SELECT id FROM media WHERE media.album_id = albums.id ORDER BY sort_order LIMIT 1)
`);

// Sync whitelist
const whitelist = process.env.WHITELIST_EMAILS;
if (whitelist) {
  const emails = whitelist.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  for (const email of emails) {
    await sql.unsafe(`INSERT INTO email_whitelist (email) VALUES ('${email}') ON CONFLICT DO NOTHING`);
  }
  console.log(`Synced ${emails.length} whitelist emails`);
}

console.log("Done!");
await sql.end();
