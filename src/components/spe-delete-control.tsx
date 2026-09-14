import { SpeLifecycleDialog } from "@/components/spe-lifecycle-dialog";
import { deleteImpactCopy, isPermanentDemoSpe, permanentDemoDeleteMessage } from "@/lib/archive";

export function SpeDeleteControl({
  code,
  name,
  afterHref,
  triggerLabel = "Delete",
}: {
  code: string;
  name: string;
  afterHref?: string;
  triggerLabel?: string;
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
      triggerLabel={triggerLabel}
      afterHref={afterHref}
    />
  );
}
