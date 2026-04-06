import OpenAI from "openai";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import postgres from "postgres";
import slugifyLib from "slugify";

// ─── Config ──────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
if (!OPENAI_API_KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1, prepare: false });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const LOCAL_BASE = "/Users/adammoisa/Desktop/Spaces Backup/moisa-personal/Family";
const INPUT_DIR = join(LOCAL_BASE, "family.moisa.cloud/input");
const TMP_DIR = "/tmp/ai-video-frames";
const BATCH_FILE = join(TMP_DIR, "batch-requests.jsonl");
const NUM_FRAMES_FOR_AI = 3; // Send 3 frames per video to keep costs down

const SYSTEM_PROMPT = `You are analyzing frames from a family home video. The family is the Moisa family, a Jewish family from New York area. The videos span from the late 1980s through the mid-2000s.

Family members you might see:
- David (son), Batya (daughter), Avi (son) - the children
- Moishe and Basi - the parents
- Babi and Iancu (Babi-Iancu) - grandparents
- Yehudah, Yehudit - extended family
- Mema, Elisabeth Bura - grandmother/great-grandmother

Common locations: Israel (Kotel, Ein Gedi, Massada, Dead Sea, Tzefat, Meron), New York area (Chelsea Piers, Bronx Zoo), Deal NJ, Florida, Puerto Rico

Common events: Jewish holidays (Succot, Chanukah, Purim, Pesach, Yom Kippur), graduations, karate, gymnastics, camp, family trips

Analyze the video frames and respond with ONLY a JSON object (no markdown, no code blocks):
{
  "title": "A descriptive title for this video (2-8 words)",
  "description": "A 1-2 sentence description of what's happening",
  "people": ["list of people you can identify or likely see"],
  "locations": ["locations visible or likely"],
  "events": ["events or activities happening"],
  "year_estimate": "estimated year if possible, or null",
  "tags": ["additional relevant tags"]
}`;

// ─── Helpers ─────────────────────────────────────────────

function extractFrame(filePath: string, timestamp: number, outputPath: string): boolean {
  try {
    execSync(
      `ffmpeg -y -ss ${timestamp} -i "${filePath}" -vframes 1 -q:v 2 -vf "scale=512:-1" "${outputPath}" 2>/dev/null`,
      { timeout: 30000 }
    );
    return existsSync(outputPath);
  } catch {
    return false;
  }
}

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

function slugify(s: string): string {
  return slugifyLib(s, { lower: true, strict: true, trim: true }) || "untitled";
}

// ─── Step 1: Prepare batch requests ──────────────────────

async function prepareBatch() {
  mkdirSync(TMP_DIR, { recursive: true });

  const videos = await sql`
    SELECT id, s3_key, filename, title
    FROM media
    WHERE type = 'video'
    ORDER BY sort_order
  `;

  console.log(`Preparing batch for ${videos.length} videos...`);

  const requests: string[] = [];
  let prepared = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const s3Key = video.s3_key as string;
    const filename = video.filename as string;
    const relPath = s3Key.replace("Family/family.moisa.cloud/input/", "");
    const localPath = join(INPUT_DIR, relPath);

    if (!existsSync(localPath)) {
      console.log(`  Skip: ${filename} (not found locally)`);
      continue;
    }

    const duration = getVideoDuration(localPath);
    if (duration <= 0) {
      console.log(`  Skip: ${filename} (no duration)`);
      continue;
    }

    // Extract frames for AI analysis
    const frameImages: { type: "image_url"; image_url: { url: string } }[] = [];
    for (let f = 0; f < NUM_FRAMES_FOR_AI; f++) {
      const pct = (f + 1) / (NUM_FRAMES_FOR_AI + 1);
      const timestamp = Math.floor(duration * pct);
      const tmpPath = join(TMP_DIR, `ai_frame_${i}_${f}.jpg`);

      if (extractFrame(localPath, timestamp, tmpPath)) {
        const base64 = readFileSync(tmpPath).toString("base64");
        frameImages.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        });
        try { unlinkSync(tmpPath); } catch {}
      }
    }

    if (frameImages.length === 0) {
      console.log(`  Skip: ${filename} (no frames extracted)`);
      continue;
    }

    // Build batch request
    const request = {
      custom_id: video.id as string,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze these ${frameImages.length} frames from a video. The original filename is "${filename}". What do you see?`,
              },
              ...frameImages,
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      },
    };

    requests.push(JSON.stringify(request));
    prepared++;

    if (prepared % 10 === 0) {
      console.log(`  Prepared ${prepared} videos...`);
    }
  }

  writeFileSync(BATCH_FILE, requests.join("\n"));
  console.log(`\nWrote ${prepared} requests to ${BATCH_FILE}`);

  return prepared;
}

// ─── Step 2: Submit batch ────────────────────────────────

async function submitBatch() {
  console.log("Uploading batch file to OpenAI...");
  const file = await openai.files.create({
    file: new File([readFileSync(BATCH_FILE)], "batch-requests.jsonl"),
    purpose: "batch",
  });
  console.log(`  File ID: ${file.id}`);

  console.log("Creating batch...");
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });
  console.log(`  Batch ID: ${batch.id}`);
  console.log(`  Status: ${batch.status}`);

  // Save batch ID for later retrieval
  writeFileSync(join(TMP_DIR, "batch-id.txt"), batch.id);
  console.log(`\nBatch submitted! Run this script with --check to check status.`);
  console.log(`Run with --apply to apply results once complete.`);

  return batch.id;
}

// ─── Step 3: Check batch status ──────────────────────────

async function checkBatch() {
  const batchId = readFileSync(join(TMP_DIR, "batch-id.txt"), "utf-8").trim();
  const batch = await openai.batches.retrieve(batchId);

  console.log(`Batch ${batchId}:`);
  console.log(`  Status: ${batch.status}`);
  console.log(`  Total: ${batch.request_counts?.total}`);
  console.log(`  Completed: ${batch.request_counts?.completed}`);
  console.log(`  Failed: ${batch.request_counts?.failed}`);

  if (batch.status === "completed" && batch.output_file_id) {
    console.log(`\nBatch complete! Run with --apply to apply results.`);
    // Download results
    const content = await openai.files.content(batch.output_file_id);
    const text = await content.text();
    writeFileSync(join(TMP_DIR, "batch-results.jsonl"), text);
    console.log(`  Results saved to ${join(TMP_DIR, "batch-results.jsonl")}`);
  }

  return batch.status;
}

// ─── Step 4: Apply results to DB ─────────────────────────

async function applyResults() {
  const resultsPath = join(TMP_DIR, "batch-results.jsonl");
  if (!existsSync(resultsPath)) {
    console.error("No results file found. Run --check first.");
    process.exit(1);
  }

  const lines = readFileSync(resultsPath, "utf-8").trim().split("\n");
  console.log(`Applying ${lines.length} results...`);

  let updated = 0;
  let failed = 0;

  for (const line of lines) {
    const result = JSON.parse(line);
    const mediaId = result.custom_id;
    const response = result.response;

    if (response?.status_code !== 200) {
      console.log(`  Failed: ${mediaId} - ${response?.status_code}`);
      failed++;
      continue;
    }

    const content = response.body?.choices?.[0]?.message?.content;
    if (!content) {
      failed++;
      continue;
    }

    try {
      // Parse JSON from the AI response (handle markdown code blocks)
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const data = JSON.parse(jsonStr);

      // Update media record with AI-generated title and description
      const newTitle = data.title || null;
      const description = data.description || null;

      // Build enriched search text
      const allTags = [
        ...(data.people || []),
        ...(data.locations || []),
        ...(data.events || []),
        ...(data.tags || []),
      ];
      const searchAddition = allTags.join(" ") + " " + (description || "");

      await sql`
        UPDATE media
        SET title = COALESCE(${newTitle}, title),
            search_text = COALESCE(search_text, '') || ' ' || ${searchAddition}
        WHERE id = ${mediaId}
      `;

      // Add new tags
      for (const person of data.people || []) {
        const tagSlug = slugify(person);
        await sql`
          INSERT INTO tags (name, slug, category)
          VALUES (${person}, ${tagSlug}, 'person')
          ON CONFLICT DO NOTHING
        `;
        await sql`
          INSERT INTO media_tags (media_id, tag_id)
          SELECT ${mediaId}, t.id FROM tags t
          WHERE t.slug = ${tagSlug} AND t.category = 'person'
          ON CONFLICT DO NOTHING
        `;
      }

      for (const loc of data.locations || []) {
        const tagSlug = slugify(loc);
        await sql`
          INSERT INTO tags (name, slug, category)
          VALUES (${loc}, ${tagSlug}, 'location')
          ON CONFLICT DO NOTHING
        `;
        await sql`
          INSERT INTO media_tags (media_id, tag_id)
          SELECT ${mediaId}, t.id FROM tags t
          WHERE t.slug = ${tagSlug} AND t.category = 'location'
          ON CONFLICT DO NOTHING
        `;
      }

      for (const event of data.events || []) {
        const tagSlug = slugify(event);
        await sql`
          INSERT INTO tags (name, slug, category)
          VALUES (${event}, ${tagSlug}, 'event')
          ON CONFLICT DO NOTHING
        `;
        await sql`
          INSERT INTO media_tags (media_id, tag_id)
          SELECT ${mediaId}, t.id FROM tags t
          WHERE t.slug = ${tagSlug} AND t.category = 'event'
          ON CONFLICT DO NOTHING
        `;
      }

      if (data.year_estimate) {
        const yearSlug = String(data.year_estimate);
        await sql`
          INSERT INTO tags (name, slug, category)
          VALUES (${yearSlug}, ${yearSlug}, 'year')
          ON CONFLICT DO NOTHING
        `;
        await sql`
          INSERT INTO media_tags (media_id, tag_id)
          SELECT ${mediaId}, t.id FROM tags t
          WHERE t.slug = ${yearSlug} AND t.category = 'year'
          ON CONFLICT DO NOTHING
        `;
      }

      updated++;
      if (updated % 10 === 0) console.log(`  Applied ${updated} results...`);
    } catch (e: any) {
      console.log(`  Parse error for ${mediaId}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone! ${updated} videos updated, ${failed} failed.`);
}

// ─── CLI ─────────────────────────────────────────────────

const arg = process.argv[2];

if (arg === "--check") {
  await checkBatch();
} else if (arg === "--apply") {
  await applyResults();
} else {
  // Default: prepare and submit
  const count = await prepareBatch();
  if (count > 0) {
    await submitBatch();
  } else {
    console.log("No videos to process.");
  }
}

await sql.end();
