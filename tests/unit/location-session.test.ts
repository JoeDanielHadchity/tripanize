import { expect, it, vi } from "vitest";
import { LocationSession, emptySharing, type LocationApi, type SharingState } from "@/lib/location-session";
import type { MemberPosition } from "@/lib/member-locations";

const active = { scope: "member-fixture", version: 1, sessionId: "session-fixture", expiresAt: new Date(Date.now() + 120000).toISOString() };
const position = { lat: 12, lng: 34, accuracy: 10, capturedAt: new Date().toISOString() };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const api: LocationApi = { self: vi.fn().mockResolvedValue(emptySharing.self), start: vi.fn().mockResolvedValue(active), update: vi.fn().mockResolvedValue(active), stop: vi.fn().mockResolvedValue({ ...emptySharing.self, version: 2 }), leave: vi.fn() };
  const gps = vi.fn().mockResolvedValue(position);
  const states: SharingState[] = [];
  const session = new LocationSession(api, gps, () => "private-lease-fixture", s => states.push(s));
  return { api, gps, states, session };
}

it("never acquires a location merely by opening the app or reading another device's status", async () => {
  const f = fixture();
  await f.session.tick();
  vi.mocked(f.api.self).mockResolvedValue(active);
  await f.session.tick();
  expect(f.gps).not.toHaveBeenCalled();
  expect(f.states.at(-1)?.phase).toBe("other");
});

it("shares only after an explicit start, pauses GPS when hidden and stops if another device revokes", async () => {
  const f = fixture();
  await f.session.start();
  vi.mocked(f.api.self).mockResolvedValue(active);
  await f.session.tick();
  expect(f.gps).toHaveBeenCalledTimes(2);
  expect(f.api.update).toHaveBeenCalledTimes(1);
  f.session.setVisible(false);
  await f.session.tick();
  expect(f.gps).toHaveBeenCalledTimes(2);
  f.session.setVisible(true);
  vi.mocked(f.api.self).mockResolvedValue({ ...emptySharing.self, version: 2 });
  await f.session.tick();
  expect(f.gps).toHaveBeenCalledTimes(2);
  expect(f.states.at(-1)?.phase).toBe("off");
});

it("discards a late GPS callback after turning off", async () => {
  const f = fixture();
  const gps = deferred<MemberPosition>();
  f.gps.mockReturnValue(gps.promise);
  const starting = f.session.start();
  await vi.waitFor(() => expect(f.gps).toHaveBeenCalled());
  await f.session.stop();
  gps.resolve(position);
  await starting;
  expect(f.api.start).not.toHaveBeenCalled();
  expect(f.api.update).not.toHaveBeenCalled();
  expect(f.states.at(-1)?.phase).toBe("off");
});

it("serializes turning off after an in-flight start and never reports sharing after cancellation", async () => {
  const f = fixture();
  const pending = deferred<typeof active>();
  vi.mocked(f.api.start).mockReturnValue(pending.promise);
  const starting = f.session.start();
  await vi.waitFor(() => expect(f.api.start).toHaveBeenCalled());
  const stopping = f.session.stop();
  expect(f.api.stop).not.toHaveBeenCalled();
  pending.resolve(active);
  await Promise.all([starting, stopping]);
  expect(f.api.stop).toHaveBeenCalledTimes(1);
  expect(f.states.some(s => s.phase === "sharing")).toBe(false);
  expect(f.states.at(-1)?.phase).toBe("off");
});

it("does not upload denied locations and releases its own lease when leaving a trip", async () => {
  const f = fixture();
  f.gps.mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { code: "LOCATION_DENIED" }));
  await f.session.start();
  expect(f.api.start).not.toHaveBeenCalled();
  expect(f.states.at(-1)?.error).toMatch(/Permission denied/);
  await f.session.start();
  f.session.dispose();
  expect(f.api.leave).toHaveBeenCalledWith("private-lease-fixture");
  await f.session.tick();
  expect(f.api.update).not.toHaveBeenCalled();
});

it("does not acquire GPS if the page became hidden while checking permission to share", async () => {
  const f = fixture();
  const pending = deferred<typeof active>();
  vi.mocked(f.api.self).mockReturnValue(pending.promise);
  const starting = f.session.start();
  f.session.setVisible(false);
  pending.resolve(active);
  await starting;
  expect(f.gps).not.toHaveBeenCalled();
  expect(f.api.start).not.toHaveBeenCalled();
});
