import { authClient } from "../../lib/auth";
import { WorkspaceScreen } from "../../components/workspace-screen";
import { SignedOutInbox } from "../../components/signed-out";
export default function InboxScreen() {
  const { data: session } = authClient.useSession();
  return session ? <WorkspaceScreen key={session.user.id} tab target={{ screen: "notifications" }} /> : <SignedOutInbox />;
}
