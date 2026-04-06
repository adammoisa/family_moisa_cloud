import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it in .env.local");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: "require",
  connect_timeout: 15,
  max: 1,
});

const migrationPath = join(
  new URL(".", import.meta.url).pathname,
  "../src/db/migrations/0000_whole_phantom_reporter.sql"
);
const migrationSql = readFileSync(migrationPath, "utf-8");

// Split on statement breakpoints and execute each
const statements = migrationSql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Running ${statements.length} migration statements...`);

try {
  for (let i = 0; i < statements.length; i++) {
    console.log(`  [${i + 1}/${statements.length}] Executing...`);
    await sql.unsafe(statements[i]);
  }

  // Enable pg_trgm for fuzzy search
  console.log("  Enabling pg_trgm extension...");
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  // Enable RLS on all tables
  console.log("  Enabling RLS...");
  const tables = [
    "media",
    "albums",
    "tags",
    "media_tags",
    "album_tags",
    "profiles",
    "email_whitelist",
  ];
  for (const table of tables) {
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`
      CREATE POLICY "Authenticated users can read ${table}"
        ON ${table} FOR SELECT TO authenticated USING (true)
    `);
  }

  // Profiles: users can update own
  await sql.unsafe(`
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id)
  `);

  // Auto-create profile on signup
  console.log("  Creating profile trigger...");
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, name)
      VALUES (new.id, new.email, new.raw_user_meta_data->>'name');
      RETURN new;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);

  await sql.unsafe(`
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
  `);

  console.log("Migration complete!");
} catch (e: any) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
