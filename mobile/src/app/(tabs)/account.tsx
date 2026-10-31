import { authClient } from "../../lib/auth";
import { WorkspaceScreen } from "../../components/workspace-screen";
import { SignedOutAccount } from "../../components/signed-out";
export default function AccountScreen() {
  const { data: session } = authClient.useSession();
  return session ? <WorkspaceScreen key={session.user.id} tab target={{ screen: "account" }} account /> : <SignedOutAccount />;
}
