"use client";

import { SpeLifecycleDialog } from "@/components/spe-lifecycle-dialog";
import { deleteImpactCopy, isPermanentDemoSpe, permanentDemoDeleteMessage } from "@/lib/archive-copy";

/** Existing Delete control (type the SPE code). Calls archiveSpe. Does not hard-delete. */
export function ArchiveDealButton({
  code,
  name,
  afterHref = "/library",
}: {
  code: string;
  name: string;
  afterHref?: string;
}) {
  if (isPermanentDemoSpe(code)) {
    return <p className="max-w-xs text-xs text-ink-500">{permanentDemoDeleteMessage(code)}</p>;
  }
  return (
    <SpeLifecycleDialog
      action="delete"
      code={code}
      name={name}
      impact={deleteImpactCopy({ code, name })}
      triggerLabel="Delete"
      afterHref={afterHref}
    />
  );
}
