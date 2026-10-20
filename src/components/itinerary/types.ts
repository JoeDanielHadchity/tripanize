import type { StopView } from "@/server/itinerary/view";
export type { StopView };

export type DayView = {
  id: string; date: string; title: string | null; area: string | null; notes: string | null; questions: string[]; isTravelDay: boolean; driveMinutes: number | null;
  activePlan: "A" | "B"; planBNote: string | null; version: number; estCostMinor: number | null;
  destination: { name: string; accommodationName: string | null; checkInTime: string | null; checkOutTime: string | null; parkingNotes: string | null } | null;
  stops: StopView[];
  weather: { kind: "forecast" | "typical"; summary: string; tMax: number | null; tMin: number | null; precipProb: number | null } | null;
};

export type ImpactData = {
  startBefore: string | null; startAfter: string | null; finishBefore: string | null; finishAfter: string | null;
  travelBefore: number; travelAfter: number; costBefore: number; costAfter: number;
  moved: { id: string; title: string; from: string | null; to: string | null }[];
  meals: { id: string; title: string; from: string | null; to: string | null }[];
  conflicts: { stopId: string; message: string; severity: "warning" | "conflict" }[];
  bookingsAffected: { id: string; title: string; status: string }[];
  material: boolean;
};
