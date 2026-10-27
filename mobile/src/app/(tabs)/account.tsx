import { useState } from "react";
import { Linking, View } from "react-native";
import { authClient, API_URL } from "../../lib/auth";
import { Brand, Button, Card, ErrorNotice, Eyebrow, Heading, Icon, Muted, Screen, T, styles } from "../../components/ui";
import { useTheme } from "../../components/theme";

export default function AccountScreen() {
  const { data: session } = authClient.useSession(); const c = useTheme();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  return <Screen><Brand /><View style={{ gap: 10, marginTop: 12 }}><Eyebrow>Your travel companion</Eyebrow><Heading>My account.</Heading></View>
    <Card><View style={styles.row}><View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Icon name="person-outline" size={26} /></View><View style={{ flex: 1 }}><T style={{ fontFamily: "InterSemibold", fontSize: 18 }}>{session?.user.name || session?.user.email.split("@")[0]}</T><Muted>{session?.user.email}</Muted></View></View></Card>
    <Card><Heading small>One account. Every trip.</Heading><Muted>Your trips stay connected across the app and website.</Muted></Card>
    <Button secondary onPress={() => void Linking.openURL(API_URL + "/privacy")}>Privacy policy</Button><Button secondary onPress={() => void Linking.openURL(API_URL + "/terms")}>Terms of use</Button>
    {error && <ErrorNotice message={error} />}
    <Button busy={busy} onPress={async () => { setBusy(true); setError(null); try { const result = await authClient.signOut(); if (result.error) throw new Error(result.error.message || "Could not sign out."); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); } }}>Sign out</Button>
  </Screen>;
}
