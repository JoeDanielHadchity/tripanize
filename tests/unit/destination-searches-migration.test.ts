import { expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
it("preserves old searches and assigns stable per-user numbers, including timestamp ties", () => {
  const db = new Database(":memory:");
  try {
    db.exec('CREATE TABLE "DestinationSearch" (id TEXT PRIMARY KEY, userId TEXT, createdAt DATETIME, status TEXT)');
    const insert = db.prepare('INSERT INTO "DestinationSearch" VALUES (?, ?, ?, ?)');
    insert.run("b", "one", "2026-01-01", "FAILED"); insert.run("a", "one", "2026-01-01", "SUCCEEDED"); insert.run("c", "one", "2026-02-01", "RUNNING"); insert.run("d", "two", "2026-01-01", "SUCCEEDED");
    db.exec(readFileSync(new URL("../../prisma/migrations/202610230014_destination_searches/migration.sql", import.meta.url), "utf8"));
    expect(db.prepare('SELECT id, number FROM "DestinationSearch" ORDER BY id').all()).toEqual([{ id: "a", number: 1 }, { id: "b", number: 2 }, { id: "c", number: 3 }, { id: "d", number: 1 }]);
    expect(db.prepare('SELECT count(*) AS n FROM "DestinationSearch" WHERE queuedAt = createdAt').get()).toEqual({ n: 4 });
  } finally { db.close(); }
});
