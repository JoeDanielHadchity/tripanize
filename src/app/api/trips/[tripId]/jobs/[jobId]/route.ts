import { NextResponse } from "next/server";
import { getJob } from "@/server/planner/jobs";
import { noStore, withUser } from "@/server/api";

export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string; jobId: string }> }) {
  const { tripId, jobId } = await params;
  return withUser(async (userId) => {
    const j = await getJob(userId, tripId, jobId);
    return NextResponse.json(
      { id: j.id, kind: j.kind, status: j.status, progress: j.progress, proposal: j.proposal, checks: j.checks, error: j.error, errorCode: j.errorCode, appliedDates: j.appliedDates, createdAt: j.createdAt, model: j.model, cancelRequested: j.cancelRequested },
      { headers: noStore },
    );
  });
}
