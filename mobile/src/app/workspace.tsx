import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "../components/workspace-screen";
import { NewTripScreen } from "../components/new-trip";
export default function WorkspaceRoute() {
  const params = useLocalSearchParams<{ view?: string; tripId?: string; item?: string; day?: string; before?: string; refresh?: string }>();
  const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
  // Creating a trip is the website's one-step form, drawn natively.
  if (first(params.view) === "new") return <NewTripScreen key={first(params.refresh)} />;
  return <WorkspaceScreen key={[params.view, params.tripId, params.item, params.day, params.before, params.refresh].join("|")} target={{ screen: first(params.view) ?? "trips", tripId: first(params.tripId), item: first(params.item), day: first(params.day), before: first(params.before) }} />;
}
