export const LOCATION_TTL_MS = 2 * 60_000;
export const LOCATION_POLL_MS = 20_000;

export type MemberPosition = { lat: number; lng: number; accuracy: number; capturedAt: string };
export type LocationSelf = { scope: string; version: number; sessionId: string | null; expiresAt: string | null };
export type LocatedMember = { userId: string; name: string; lat: number; lng: number; accuracy: number; updatedAt: string; expiresAt: string };
export type MemberLocations = { members: { userId: string; name: string }[]; locations: LocatedMember[]; self: LocationSelf };
