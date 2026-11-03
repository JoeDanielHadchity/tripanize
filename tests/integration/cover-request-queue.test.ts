import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { appRuntime, currentRuntime } from "@/server/cloudflare/runtime";
import { serializedDatabase, type Serialize } from "@/server/cloudflare/serialized-db";
import { findDestinationImage } from "@/server/images";
import { resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());

it("never makes a locked HTTP request wait for a background database write", async () => {
  const runtime = currentRuntime();
  let pending: Promise<unknown> = Promise.resolve();
  const serialize: Serialize = run => {
    const result = pending.then(run, run);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
  let began!: () => void, release!: () => void, joined!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const insideHttp = new Promise<void>(resolve => { joined = resolve; });
  const fetch = vi.fn(async () => { began(); await gate; return Response.json({ query: { pages: {} } }); });
  vi.stubGlobal("fetch", fetch);
  const background = appRuntime.run({ ...runtime, database: serializedDatabase(runtime.database, serialize) }, () => findDestinationImage("Queue fixture city"));
  await started;
  const http = serialize(() => appRuntime.run(runtime, async () => { joined(); return findDestinationImage("Queue fixture city"); }));
  await insideHttp;
  // Both callers have reached the lookup before the provider replies.
  await new Promise(resolve => setTimeout(resolve, 20));
  release();
  const result = await Promise.race([
    Promise.all([background, http]).then(() => "finished"),
    new Promise(resolve => setTimeout(() => resolve("blocked"), 1000)),
  ]);
  expect(result).toBe("finished");
});
