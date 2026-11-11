import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, authClient, photo } from "../lib/auth";
import { Button, ErrorNotice, Eyebrow, Heading, IconButton, Muted, PhotoCard, Screen, T } from "../components/ui";
import { publicLoginDestination } from "../lib/public-data";
import { useTheme } from "../components/theme";
import { clearPendingSignIn, pendingSignIn, savePendingSignIn } from "../lib/pending-sign-in";

type Mode = "code" | "password" | "signup";
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function SignInScreen() {
  const c = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { data: session } = authClient.useSession();
  const [mode, setMode] = useState<Mode>("code");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [password, setPassword] = useState("");
  // "sent": waiting for a sign-in code. "confirm": a new password account confirming its email.
  const [sent, setSent] = useState(false); const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); const [google, setGoogle] = useState(false);

  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  // Is "Continue with Google" switched on for this server?
  useEffect(() => { let alive = true; fetch(`${API_URL}/api/mobile/auth-options`).then(r => r.ok ? r.json() as Promise<{ google?: boolean }> : null).then(o => { if (alive && o?.google) setGoogle(true); }).catch(() => undefined); return () => { alive = false; }; }, []);
  // Back from the email app (even if Android closed Tripanize meanwhile): the code screen is still here.
  useEffect(() => {
    let alive = true;
    void pendingSignIn().then(p => {
      if (!alive || !p) return;
      setEmail(p.email);
      if (p.purpose === "verify") setConfirm(true); else { setMode("code"); setSent(true); }
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!session || busy || confirm) return;
    const destination = publicLoginDestination(next);
    // Tabs are already underneath; going back shows them signed in without a second copy.
    if (["/", "/trips", "/inbox", "/account"].includes(destination) && router.canGoBack()) { router.back(); if (destination !== "/") router.navigate(destination as "/trips"); }
    else router.replace(destination as "/");
  }, [session, busy, confirm, next]);

  const inputStyle = { backgroundColor: c.paper, borderColor: c.line, color: c.ink, borderWidth: 1, borderRadius: 14, minHeight: 56, paddingHorizontal: 16, fontFamily: "Nunito", fontSize: 16 };
  const address = () => email.trim().toLowerCase();
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Could not connect. Please try again.");
  async function finish() {
    await clearPendingSignIn();
    const current = await authClient.getSession();
    if (!current.data?.user) throw new Error(current.error?.message || "Could not finish signing in. Please try again.");
  }
  function switchMode(m: Mode) { setMode(m); setSent(false); setCode(""); setError(null); setNotice(null); void clearPendingSignIn(); }

  async function submit() {
    if (!emailOk(address())) { setError("Enter your email address."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "password") {
        const r = await authClient.signIn.email({ email: address(), password });
        if (r.error) throw new Error(r.error.message || "Could not sign in.");
        await finish();
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("Enter your name.");
        if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
        const r = await authClient.signUp.email({ name: name.trim(), email: address(), password });
        if (r.error) throw new Error(r.error.code === "USER_ALREADY_EXISTS" || r.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ? "An account with this email already exists. Sign in instead." : r.error.message || "Couldn't create the account.");
        // Signed in. Confirm the email with a code (needed for gifted credits); people can skip it.
        setConfirm(true);
        await sendConfirmCode();
      } else if (!sent) {
        const r = await authClient.emailOtp.sendVerificationOtp({ email: address(), type: "sign-in" });
        if (r.error) throw new Error(r.error.message || "Could not send your code.");
        await savePendingSignIn({ email: address(), purpose: "sign-in" });
        setSent(true); setCooldown(60);
      } else {
        if (code.length !== 6) throw new Error("Enter the 6-digit code.");
        const r = await authClient.signIn.emailOtp({ email: address(), otp: code });
        if (r.error) throw new Error(r.error.message || "Check your code and try again.");
        await finish();
      }
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function sendConfirmCode() {
    const r = await authClient.emailOtp.sendVerificationOtp({ email: address(), type: "email-verification" });
    if (r.error) throw new Error(r.error.message || "Could not send your code.");
    await savePendingSignIn({ email: address(), purpose: "verify" });
    setCooldown(60); setCode("");
  }
  async function verify() {
    if (code.length !== 6) { setError("Enter the 6-digit code."); return; }
    setBusy(true); setError(null);
    try {
      const r = await authClient.emailOtp.verifyEmail({ email: address(), otp: code });
      if (r.error) throw new Error(r.error.message || "Check your code and try again.");
      await clearPendingSignIn(); setConfirm(false);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(null);
    try {
      if (confirm) await sendConfirmCode();
      else {
        const r = await authClient.emailOtp.sendVerificationOtp({ email: address(), type: "sign-in" });
        if (r.error) throw new Error(r.error.message || "Could not send your code.");
        await savePendingSignIn({ email: address(), purpose: "sign-in" }); setCooldown(60);
      }
      setNotice("A new code is on its way.");
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function withGoogle() {
    setBusy(true); setError(null);
    try {
      const r = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (r.error) throw new Error(r.error.message || "Could not sign in with Google.");
      const current = await authClient.getSession();
      if (!current.data?.user) throw new Error("Google sign-in was cancelled.");
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }

  const codeInput = <TextInput accessibilityLabel="6-digit code" placeholder="000000" placeholderTextColor={c.muted} style={{ ...inputStyle, fontSize: 24, letterSpacing: 8, textAlign: "center" }} value={code} onChangeText={v => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} returnKeyType="go" onSubmitEditing={() => void (confirm ? verify() : submit())} />;
  const resendLink = <Pressable accessibilityRole="button" disabled={busy || cooldown > 0} onPress={() => void resend()} style={{ minHeight: 44, justifyContent: "center" }}><T style={{ textAlign: "center", color: cooldown > 0 ? c.muted : c.accent, fontSize: 13 }}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}</T></Pressable>;
  const link = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: "center" }}><T style={{ textAlign: "center", color: c.accent, fontSize: 14, fontFamily: "NunitoBold" }}>{label}</T></Pressable>;

  // A new password account confirming its email.
  if (confirm) return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><Screen>
    <View style={{ gap: 9 }}><Eyebrow>Almost there</Eyebrow><Heading>Confirm your email.</Heading><Muted>{`We sent a 6-digit code to ${address()}. You can leave the app to get it; this screen will be waiting.`}</Muted></View>
    {error && <ErrorNotice message={error} />}
    {notice && <Muted>{notice}</Muted>}
    <View style={{ gap: 12 }}>
      {codeInput}
      <Button busy={busy} onPress={() => void verify()}>Confirm email</Button>
      {resendLink}
      <Pressable accessibilityRole="button" onPress={() => { void clearPendingSignIn(); setConfirm(false); }} style={{ minHeight: 44, justifyContent: "center" }}><Muted style={{ textAlign: "center" }}>Skip for now</Muted></Pressable>
    </View>
  </Screen></KeyboardAvoidingView>;

  const title = mode === "signup" ? "Create your\naccount." : sent ? "Check your inbox." : "Good trips\nstart here.";
  const subtitle = mode === "signup" ? "Choose a password. You'll confirm your email with a code." : sent ? `We sent a code to ${address()}. You can leave the app to get it; this screen will be waiting.` : "Sign in or create your Tripanize account.";
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><Screen>
    <PhotoCard source={photo("/editorial/auth.webp")} height={sent ? 140 : 190} radius={28} label="A new journey awaits" top={<IconButton name="close" label="Close" onImage onPress={() => { void clearPendingSignIn(); if (router.canGoBack()) router.back(); else router.replace("/"); }} />} />
    <View style={{ gap: 9 }}><Eyebrow>A little more going</Eyebrow><Heading>{title}</Heading><Muted>{subtitle}</Muted></View>
    {error && <ErrorNotice message={error} />}
    {notice && <Muted>{notice}</Muted>}

    {google && !sent && <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={busy} onPress={() => void withGoogle()}
        style={({ pressed }) => ({ minHeight: 56, borderRadius: 28, borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: pressed || busy ? 0.7 : 1 })}>
        <Ionicons name="logo-google" size={20} color={c.ink} /><T style={{ fontFamily: "NunitoBold", fontSize: 16 }}>Continue with Google</T>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1, height: 1, backgroundColor: c.line }} /><Muted>or</Muted><View style={{ flex: 1, height: 1, backgroundColor: c.line }} /></View>
    </View>}

    <View style={{ gap: 12 }}>
      {mode === "signup" && <><T style={{ fontFamily: "NunitoBold", fontSize: 13 }}>Your name</T><TextInput accessibilityLabel="Your name" placeholder="Shown to people you travel with" placeholderTextColor={c.muted} style={inputStyle} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={80} returnKeyType="next" /></>}
      <T style={{ fontFamily: "NunitoBold", fontSize: 13 }}>Email address</T>
      <TextInput accessibilityLabel="Email address" placeholder="you@example.com" placeholderTextColor={c.muted} style={inputStyle} value={email} onChangeText={setEmail} editable={!sent} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType={mode === "code" ? "go" : "next"} onSubmitEditing={() => { if (mode === "code") void submit(); }} />
      {mode !== "code" && <><T style={{ fontFamily: "NunitoBold", fontSize: 13 }}>Password</T><TextInput accessibilityLabel="Password" placeholder={mode === "signup" ? "At least 10 characters" : "Your password"} placeholderTextColor={c.muted} style={inputStyle} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signup" ? "new-password" : "current-password"} textContentType={mode === "signup" ? "newPassword" : "password"} returnKeyType="go" onSubmitEditing={() => void submit()} /></>}
      {mode === "code" && sent && codeInput}
      <Button busy={busy} onPress={() => void submit()}>{mode === "signup" ? "Create account" : mode === "password" ? "Sign in" : sent ? "Verify & continue" : "Email me a code"}</Button>
      {mode === "code" && sent && <>{resendLink}<Pressable accessibilityRole="button" onPress={() => switchMode("code")} style={{ minHeight: 44, justifyContent: "center" }}><Muted style={{ textAlign: "center" }}>Use another email</Muted></Pressable></>}
      {mode === "password" && link("Forgot your password?", () => void Linking.openURL(`${API_URL}/forgot-password`))}
      {mode === "signup" && <Muted style={{ fontSize: 12, lineHeight: 17 }}>By creating an account, you agree to our Terms of service and Privacy policy at tripanize.app.</Muted>}
    </View>

    {!sent && <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
      {mode !== "code" && link("Sign in with an email code instead", () => switchMode("code"))}
      {mode !== "password" && link("Sign in with a password", () => switchMode("password"))}
      {mode !== "signup" && link("New here? Create an account with a password", () => switchMode("signup"))}
    </View>}
  </Screen></KeyboardAvoidingView>;
}
