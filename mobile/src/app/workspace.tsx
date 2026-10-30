import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "../components/workspace-screen";
export default function WorkspaceRoute() {
  const params = useLocalSearchParams<{ view?: string; tripId?: string; item?: string; day?: string; before?: string; refresh?: string }>();
  const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
  return <WorkspaceScreen key={[params.view, params.tripId, params.item, params.day, params.before, params.refresh].join("|")} target={{ screen: first(params.view) ?? "trips", tripId: first(params.tripId), item: first(params.item), day: first(params.day), before: first(params.before) }} />;
}
