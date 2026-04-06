import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error("GEMINI_API_KEY required"); process.exit(1); }

const PUBLIC_DIR = join(import.meta.dir, "../public");

async function generateImage(prompt: string, filename: string): Promise<boolean> {
  console.log(`Generating ${filename}...`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error(`  API error (${response.status}): ${err.slice(0, 300)}`);
    return false;
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) {
    console.error("  No parts in response");
    console.error("  Response:", JSON.stringify(data).slice(0, 500));
    return false;
  }

  for (const part of parts) {
    if (part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      writeFileSync(join(PUBLIC_DIR, filename), buffer);
      console.log(`  Saved ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
      return true;
    }
  }

  console.error("  No image data in response");
  return false;
}

async function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true });

  await generateImage(
    `Design a minimal, elegant logo icon for "Moisa Family Gallery" - a private family photo gallery website. Simple, modern, works on dark backgrounds. Incorporate a subtle camera lens or photo frame motif. Warm gold/amber accent color on dark background. Square format, 512x512 pixels. Clean and professional. No text, just the icon.`,
    "logo.png"
  );

  await generateImage(
    `Design a social media preview image for "Moisa Family Gallery" - a private family photo & video archive website. 1200x630 pixels. Feature the text "Moisa Family Gallery" prominently centered. Subtitle underneath: "A private collection of family memories". Dark charcoal background with warm amber/gold accent elements. Subtle photo frame shapes or camera motifs in the background. Modern, warm, elegant. No real faces or people. Professional typography.`,
    "og-image.png"
  );

  console.log("\nDone!");
}

main().catch(console.error);
