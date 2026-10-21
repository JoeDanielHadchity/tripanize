import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type SessionUser = { id: string; name: string; email: string };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  // Code sign-ups may skip the name; fall back to the email's local part so travelers never appear blank.
  return { id: session.user.id, name: session.user.name?.trim() || session.user.email.split("@")[0], email: session.user.email };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
