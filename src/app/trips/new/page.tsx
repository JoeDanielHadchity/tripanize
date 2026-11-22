import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { AppHeader } from "@/components/shell";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";
import { TripWizard } from "@/components/trip-wizard";
import { PlanChoice } from "@/components/plan-choice";
import { creditsView } from "@/server/credits/service";
import { startPlan } from "@/server/trips/onboarding";

export const metadata: Metadata = { title: "Create a trip" };

export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireUser();
  const trial = await userTrialAccess(user.id);
  const plan = startPlan((await searchParams).plan);
  // First the plan (unless a Premium trial invitation covers the trip), then where and when.
  const choose = !plan && trial.status !== "available";
  return (
    <>
      <AppHeader user={user} current="trips" />
      <main id="main" className="mx-auto max-w-3xl px-4 pt-6">
        {trial.status !== "available" && <TrialAccessBanner access={trial} />}
        {/* One question per screen; the same steps as the app (src/lib/trip-wizard.ts). */}
        {choose ? <PlanChoice credits={await creditsView(user.id)} />
          : <TripWizard trial={trial.status === "available" ? { invitationId: trial.invitationId, durationDays: trial.durationDays } : undefined} plan={plan} />}
      </main>
    </>
  );
}
