import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import { PrismaClient } from "@/generated/prisma/client";
import { currentRuntime } from "@/server/cloudflare/runtime";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
// Describe SQLite JSON arrays with their existing application types. Keep this
// extension type-only: lazy result proxies are unsuitable for server-action data.
function scalarListTypes(client: PrismaClient) {
  return client.$extends({ result: {
    profile: { interests: { needs: { interests: true }, compute: (r) => strings(r.interests) } },
    trip: {
      interests: { needs: { interests: true }, compute: (r) => strings(r.interests) },
      transport: { needs: { transport: true }, compute: (r) => strings(r.transport) },
    },
    itineraryDay: { questions: { needs: { questions: true }, compute: (r) => strings(r.questions) } },
    stop: { sourceUrls: { needs: { sourceUrls: true }, compute: (r) => strings(r.sourceUrls) } },
    generationJob: { appliedDates: { needs: { appliedDates: true }, compute: (r) => strings(r.appliedDates) } },
    notificationPreference: { changeTypes: { needs: { changeTypes: true }, compute: (r) => strings(r.changeTypes) } },
  } });
}
export type AppDatabase = ReturnType<typeof scalarListTypes>;
export function createDatabase(adapter: SqlDriverAdapterFactory): AppDatabase {
  return new PrismaClient({ adapter }) as unknown as AppDatabase;
}
export const prisma = new Proxy({} as AppDatabase, {
  get(_target, property) {
    const db = currentRuntime().database;
    const value = Reflect.get(db, property);
    return typeof value === "function" ? value.bind(db) : value;
  },
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
