import { useLocalSearchParams } from "expo-router";
import { WorkspaceScreen } from "../components/workspace-screen";
export default function WorkspaceRoute() {
  const params = useLocalSearchParams<{ screen?: string; tripId?: string; item?: string; day?: string; before?: string; refresh?: string }>();
  const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
  return <WorkspaceScreen key={[params.screen, params.tripId, params.item, params.day, params.before, params.refresh].join("|")} target={{ screen: first(params.screen) ?? "trips", tripId: first(params.tripId), item: first(params.item), day: first(params.day), before: first(params.before) }} />;
}
