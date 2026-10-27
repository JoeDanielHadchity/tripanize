import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { authClient, photo } from "../lib/auth";
import { Brand, Button, ErrorNotice, Eyebrow, Heading, Muted, Screen, T } from "../components/ui";
import { useTheme } from "../components/theme";

export default function SignInScreen() {
  const c = useTheme();
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false); const [passwordMode, setPasswordMode] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const inputStyle = { backgroundColor: c.paper, borderColor: c.line, color: c.ink, borderWidth: 1, borderRadius: 14, minHeight: 56, paddingHorizontal: 16, fontFamily: "Inter", fontSize: 16 };
  async function submit() {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError("Enter your email address."); return; }
    if (sent && !passwordMode && code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true); setError(null);
    try {
      if (passwordMode) {
        const result = await authClient.signIn.email({ email: address, password });
        if (result.error) throw new Error(result.error.message || "Could not sign in.");
      } else if (!sent) {
        const result = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
        if (result.error) throw new Error(result.error.message || "Could not send your code.");
        setSent(true); setCooldown(60); return;
      } else {
        const result = await authClient.signIn.emailOtp({ email: address, otp: code });
        if (result.error) throw new Error(result.error.message || "Check your code and try again.");
      }
      await authClient.getSession(); router.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><Screen>
    <Brand /><Image source={photo("/editorial/auth.webp")} accessibilityLabel="A new journey awaits" style={{ height: 185, width: "100%", borderRadius: 24, marginTop: 6 }} contentFit="cover" />
    <View style={{ gap: 9 }}><Eyebrow>A little more going</Eyebrow><Heading>{sent && !passwordMode ? "Check your inbox." : "Good trips\nstart here."}</Heading><Muted>{sent && !passwordMode ? `We sent a code to ${email.trim()}.` : "Sign in or create your Tripanize account."}</Muted></View>
    {error && <ErrorNotice message={error} />}
    <View style={{ gap: 12 }}>
      <T style={{ fontFamily: "InterSemibold", fontSize: 13 }}>Email address</T><TextInput accessibilityLabel="Email address" placeholder="you@example.com" placeholderTextColor={c.muted} style={inputStyle} value={email} onChangeText={setEmail} editable={!sent || passwordMode} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
      {passwordMode ? <TextInput accessibilityLabel="Password" placeholder="Your password" placeholderTextColor={c.muted} style={inputStyle} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" /> : sent && <TextInput accessibilityLabel="6-digit sign-in code" placeholder="000000" placeholderTextColor={c.muted} style={[inputStyle, { letterSpacing: 8, textAlign: "center", fontSize: 25 }]} value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />}
      <Button busy={busy} onPress={() => void submit()}>{passwordMode ? "Sign in" : sent ? "Verify & continue" : "Email me a code"}</Button>
      {sent && !passwordMode && <Pressable accessibilityRole="button" disabled={busy || cooldown > 0} onPress={async () => { setBusy(true); try { const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" }); if (result.error) throw new Error(result.error.message); setCooldown(60); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not resend."); } finally { setBusy(false); } }}><T style={{ textAlign: "center", color: c.accent, padding: 8 }}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</T></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => { setPasswordMode(!passwordMode); setSent(false); setCode(""); setError(null); }}><T style={{ textAlign: "center", color: c.accent, padding: 8, fontSize: 13 }}>{passwordMode ? "Use an email code instead" : "Use a password instead"}</T></Pressable>
      {sent && <Pressable accessibilityRole="button" onPress={() => { setSent(false); setCode(""); }}><Muted>Use another email</Muted></Pressable>}
    </View>
  </Screen></KeyboardAvoidingView>;
}
