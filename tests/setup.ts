import { config } from "dotenv";
import { readFileSync } from "node:fs";
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
sqlite.exec(readFileSync(new URL("../prisma/migrations/202610220001_cloudflare_initial/migration.sql", import.meta.url), "utf8"));
sqlite.close();
setTestRuntime({ database: createDatabase(new PrismaBetterSqlite3({ url: `file:${file}` })), authSecret: "isolated-test-secret-not-used-in-production" });
