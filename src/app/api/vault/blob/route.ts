import { postBlobClientHandle } from "@/lib/deals/blob-handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Same handleUpload helper as Add Deal — vault large files never enter the function body. */
export const POST = postBlobClientHandle;
