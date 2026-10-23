import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "@/server/db";
import { accountDisplayName, isCompanyAccount } from "@/server/admin/identity";

export type SessionUser = { id: string; name: string; email: string; companyAdmin?: boolean };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  // Code sign-ups may skip the name; fall back to the email's local part so travelers never appear blank.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return null;
  return { id: user.id, name: accountDisplayName(user).trim() || user.email.split("@")[0], email: user.email, companyAdmin: isCompanyAccount(user) };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
