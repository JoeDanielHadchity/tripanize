import type { Metadata } from "next";
import { OfflineTrips } from "./view";

export const metadata: Metadata = { title: "Offline trips" };

export default function OfflinePage() {
  return <OfflineTrips />;
}
