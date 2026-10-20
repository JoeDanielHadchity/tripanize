import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
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
  plugins: [nextCookies()],
});
