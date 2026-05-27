/**
 * Run this script once to create all DB tables:
 *   pnpm db:migrate
 */
import { pool } from "./index";
import fs from "fs";
import path from "path";

async function migrate() {
  const client = await pool.connect();
  try {
    const migrationDir = path.join(__dirname, "migrations");
    const files = fs
      .readdirSync(migrationDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`[migrate] Running ${files.length} migration(s)...`);

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      console.log(`[migrate] Running: ${file}`);
      await client.query(sql);
    }

    console.log("[migrate] ✅ All migrations completed.");
  } catch (err: any) {
    console.error("[migrate] ❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
