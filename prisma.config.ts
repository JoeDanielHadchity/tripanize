import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Only used by local schema tools. Production storage is the Durable Object.
  datasource: { url: process.env.DATABASE_URL ?? "file:./dev.sqlite" },
});
