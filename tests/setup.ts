import { config } from "dotenv";
config();
// Integration tests run against a separate database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/roam_test";
