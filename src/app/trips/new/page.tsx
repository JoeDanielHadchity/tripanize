import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
import { TripWizard } from "@/components/trip-wizard";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage() {
  const user = await requireUser();
  const trial = await userTrialAccess(user.id);
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pt-6">
        {trial.status !== "available" && <TrialAccessBanner access={trial} />}
        {/* One question per screen; the same steps as the app (src/lib/trip-wizard.ts). */}
        <TripWizard trial={trial.status === "available" ? { invitationId: trial.invitationId, durationDays: trial.durationDays } : undefined} />
      </main>
    </>
  );
}
