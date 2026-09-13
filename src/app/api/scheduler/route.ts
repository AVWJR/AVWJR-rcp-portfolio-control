import { listReportJobs } from "@/lib/scheduler";
import { serialize } from "@/lib/serialize";
import { DEFAULT_SCHEDULED_JOBS } from "@rcp/documents";
import { NextResponse } from "next/server";

export async function GET() {
  const jobs = await listReportJobs();
  return NextResponse.json(
    serialize({
      definitions: DEFAULT_SCHEDULED_JOBS,
      jobs,
    }),
  );
}
