import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createDatabase } from "@/server/db";
import { setTestRuntime } from "@/server/cloudflare/runtime";
config();
// Every test file has an isolated SQLite database, never a production binding.
const file = join(tmpdir(), `tripanize-test-${randomUUID()}.sqlite`);
const sqlite = new Database(file);
const migrations = new URL("../prisma/migrations/", import.meta.url);
for (const name of readdirSync(migrations).filter(name => /^\d/.test(name)).sort()) {
  sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrations), "utf8"));
}
sqlite.close();
setTestRuntime({ database: createDatabase(new PrismaBetterSqlite3({ url: `file:${file}` })), authSecret: "isolated-test-secret-not-used-in-production" });
