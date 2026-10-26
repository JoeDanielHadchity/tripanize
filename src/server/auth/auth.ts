import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { sendEmail } from "@/server/notifications/email";
import { accountDisplayName } from "@/server/admin/identity";

function createAuth() { return betterAuth({
  appName: "Tripanize",
  baseURL: currentRuntime().appUrl ?? process.env.BETTER_AUTH_URL,
  secret: currentRuntime().authSecret,
  // Trust only the configured branded app domains.
  trustedOrigins: (() => {
    const base = currentRuntime().appUrl ?? process.env.APP_URL ?? process.env.BETTER_AUTH_URL;
    if (!base) return [];
    try {
      const u = new URL(base);
      const alt = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      const origins = [u.origin, `${u.protocol}//${alt}`];
      return origins;
    } catch {
      return [];
    }
  })(),
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  databaseHooks: { session: { create: { before: async session => {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { suspendedAt: true } });
    if (!user || user.suspendedAt) return false;
    return { data: { ...session, normalMode: false, adminEmailVerifiedAt: null, adminVerifiedUntil: null, adminEmailUnlockedAt: null } };
  } } }, user: {
    create: { before: async user => ({ data: { ...user, name: accountDisplayName(user) } }) },
    update: { after: async user => {
      const name = accountDisplayName(user);
      if (user.name !== name) {
        await prisma.user.update({ where: { id: user.id }, data: { name } });
        await prisma.traveler.updateMany({ where: { userId: user.id }, data: { name } });
      }
    } },
  } },
  advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      const res = await sendEmail({
        to: user.email,
        subject: "Reset your Tripanize password",
        text: `Someone asked to reset the password for your Tripanize account.\n\nOpen this link within 30 minutes to choose a new password:\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
      if (res.status !== "sent") {
        // Surface the real reason to the reset form instead of silently claiming success.
        throw new Error(res.status === "not_configured" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_FAILED");
      }
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, additionalFields: {
    normalMode: { type: "boolean", defaultValue: false, input: false, returned: false },
    adminEmailVerifiedAt: { type: "date", required: false, input: false, returned: false },
    adminVerifiedUntil: { type: "date", required: false, input: false, returned: false },
    adminEmailUnlockedAt: { type: "date", required: false, input: false, returned: false },
  } },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [
    // Passwordless sign-in: a 6-digit code by email (delivered through Resend or SMTP). The first successful
    // code sign-in creates the account, already email-verified.
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      rateLimit: { window: 60, max: 5 },
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") throw new Error("UNSUPPORTED_OTP_TYPE");
        const res = await sendEmail({
          to: email,
          subject: `${otp} is your Tripanize sign-in code`,
          text: `Your Tripanize sign-in code is ${otp}\n\nEnter it on the sign-in page within 10 minutes. If you didn't try to sign in, you can ignore this email.`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:28rem;margin:auto;padding:24px;color:#13201f"><p style="font-size:18px;font-weight:600;margin:0 0 12px">Your Tripanize sign-in code</p><p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${otp}</p><p style="margin:0 0 8px">Enter it on the sign-in page within 10 minutes.</p><p style="color:#4f6563;font-size:13px;margin:0">If you didn't try to sign in, you can ignore this email.</p></div>`,
        });
        if (res.status !== "sent") throw new Error(res.status === "not_configured" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_FAILED");
      },
    }),
    nextCookies(),
  ],
});

}
let instance: ReturnType<typeof createAuth> | undefined;
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  has(_target, property) { return property === "handler" || property === "api"; },
  get(_target, property) {
    instance ??= createAuth();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
