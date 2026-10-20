import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/notifications/email";

export const auth = betterAuth({
  appName: "Roam",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      const res = await sendEmail({
        to: user.email,
        subject: "Reset your Roam password",
        text: `Someone asked to reset the password for your Roam account.\n\nOpen this link within 30 minutes to choose a new password:\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
      if (res.status !== "sent") {
        // Surface the real reason to the reset form instead of silently claiming success.
        throw new Error(res.status === "not_configured" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_FAILED");
      }
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
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
          subject: `${otp} is your Roam sign-in code`,
          text: `Your Roam sign-in code is ${otp}\n\nEnter it on the sign-in page within 10 minutes. If you didn't try to sign in, you can ignore this email.`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:28rem;margin:auto;padding:24px;color:#2b2420"><p style="font-size:18px;font-weight:600;margin:0 0 12px">Your Roam sign-in code</p><p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${otp}</p><p style="margin:0 0 8px">Enter it on the sign-in page within 10 minutes.</p><p style="color:#776b62;font-size:13px;margin:0">If you didn't try to sign in, you can ignore this email.</p></div>`,
        });
        if (res.status !== "sent") throw new Error(res.status === "not_configured" ? "EMAIL_NOT_CONFIGURED" : "EMAIL_FAILED");
      },
    }),
    nextCookies(),
  ],
});
