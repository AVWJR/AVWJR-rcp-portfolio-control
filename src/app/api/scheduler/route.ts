import { enforce, resolveActor, visibleEntityCodes } from "@/lib/auth/actor";
import { listReportJobs } from "@/lib/scheduler";
import { serialize } from "@/lib/serialize";
import { DEFAULT_SCHEDULED_JOBS } from "@rcp/documents";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await enforce("read");
  if (denied) return denied;
  const actor = await resolveActor();
  const codes = await visibleEntityCodes(actor);
  const jobs = (await listReportJobs()).filter((job) => {
    if (!codes) return true;
    if (job.entityId && actor.entityIds?.includes(job.entityId)) return true;
    return codes.has(job.entityCode);
  });
  return NextResponse.json(
    serialize({
      definitions: DEFAULT_SCHEDULED_JOBS,
      jobs,
    }),
  );
}
