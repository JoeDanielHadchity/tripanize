import type { LocationSelf, MemberPosition } from "./member-locations";

export type SharingState = { self: LocationSelf; phase: "off" | "starting" | "sharing" | "paused" | "other" | "stopping"; error: string };
export type LocationApi = {
  self(): Promise<LocationSelf>;
  start(token: string, previous: LocationSelf, position: MemberPosition): Promise<LocationSelf>;
  update(token: string, position: MemberPosition): Promise<LocationSelf>;
  stop(token?: string): Promise<LocationSelf>;
  leave(token: string): void;
};
export const emptySharing: SharingState = { self: { scope: "", version: 0, sessionId: null, expiresAt: null }, phase: "off", error: "" };

/** Coordinates are acquired only after a click and kept only for the current request.
 * Serial writes and versioned leases make late callbacks harmless after stopping.
 */
export class LocationSession {
  private state: SharingState = emptySharing;
  private token: string | null = null;
  private sessionId: string | null = null;
  private generation = 0;
  private visible = true;
  private disposed = false;
  private busy = false;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private api: LocationApi, private position: () => Promise<MemberPosition>, private makeToken: () => string, private changed: (state: SharingState) => void) {}
  private publish(patch: Partial<SharingState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.changed(this.state);
  }
  private write<T>(run: () => Promise<T>): Promise<T> {
    const result = this.writes.then(run, run);
    this.writes = result.catch(() => undefined);
    return result;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible && this.token && this.sessionId) this.publish({ phase: "paused" });
  }
  async start() {
    if (this.disposed || this.state.phase === "starting" || this.state.phase === "stopping") return;
    const gen = ++this.generation;
    const token = this.makeToken();
    this.token = token;
    this.sessionId = null;
    this.publish({ phase: "starting", error: "" });
    try {
      const previous = await this.api.self();
      if (gen !== this.generation || this.disposed) return;
      this.publish({ self: previous });
      if (!this.visible) throw new Error("Keep Tripanize visible, then turn sharing on again.");
      const point = await this.position();
      if (gen !== this.generation || this.disposed) return;
      if (!this.visible) throw new Error("Keep Tripanize visible, then turn sharing on again.");
      const result = await this.write(async () => {
        if (gen !== this.generation || this.disposed) return null;
        return this.api.start(token, previous, point);
      });
      if (!result || gen !== this.generation || this.disposed) return;
      this.sessionId = result.sessionId;
      this.publish({ self: result, phase: this.visible ? "sharing" : "paused" });
    } catch (error) {
      if (gen !== this.generation || this.disposed) return;
      this.token = null;
      this.sessionId = null;
      this.api.leave(token);
      this.publish({ phase: this.state.self.sessionId ? "other" : "off", error: error instanceof Error ? error.message : "Couldn’t start sharing. Please try again." });
    }
  }
  async stop() {
    if (this.disposed || this.state.phase === "stopping") return;
    const gen = ++this.generation;
    this.token = null;
    this.sessionId = null;
    this.publish({ phase: "stopping", error: "" });
    try {
      const result = await this.write(() => this.api.stop());
      if (gen === this.generation) this.publish({ self: result, phase: "off" });
    } catch {
      if (gen === this.generation) this.publish({ phase: this.state.self.sessionId ? "other" : "off", error: "Location updates stopped on this device. Couldn’t confirm removal of your pin; retry turning off when online. The last pin expires within two minutes." });
    }
  }
  async tick() {
    if (this.busy || this.disposed || !this.visible || this.state.phase === "starting" || this.state.phase === "stopping") return;
    this.busy = true;
    const gen = this.generation;
    try {
      const status = await this.api.self();
      if (this.disposed || gen !== this.generation) return;
      if (!this.token) { this.publish({ self: status, phase: status.sessionId ? "other" : "off" }); return; }
      if (status.sessionId !== this.sessionId) {
        this.token = null; this.sessionId = null;
        this.publish({ self: status, phase: status.sessionId ? "other" : "off", error: "Sharing stopped, expired or moved to another device. Turn it on again to resume here." });
        return;
      }
      if (!this.visible) return;
      const token = this.token;
      const point = await this.position();
      if (this.disposed || gen !== this.generation || !this.visible) return;
      const result = await this.write(async () => gen === this.generation && !this.disposed && this.visible ? this.api.update(token, point) : null);
      if (result && gen === this.generation && !this.disposed) this.publish({ self: result, phase: this.visible ? "sharing" : "paused", error: "" });
    } catch (error) {
      if (this.disposed || gen !== this.generation) return;
      const code = (error as { code?: string }).code;
      if (["UNAUTHENTICATED", "NOT_FOUND", "FORBIDDEN", "CONFLICT", "LOCATION_DENIED"].includes(code ?? "")) {
        const old = this.token;
        this.token = null; this.sessionId = null;
        if (old) this.api.leave(old);
        this.publish({ self: emptySharing.self, phase: "off", error: error instanceof Error ? error.message : "Location sharing stopped." });
      } else if (this.token) this.publish({ phase: "paused", error: "Location update unavailable. Keep the app open and online; your last pin expires within two minutes without an update." });
    } finally { this.busy = false; }
  }
  dispose() {
    this.disposed = true; this.generation++;
    if (this.token) this.api.leave(this.token);
    this.token = null; this.sessionId = null;
  }
}
