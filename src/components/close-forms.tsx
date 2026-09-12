"use client";

import { checklistAction, hardLockAction, reopenAction, softCloseAction } from "@/app/actions/close";
import { useFormStatus } from "react-dom";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-navy-900 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cream-100 disabled:opacity-50"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function SoftCloseButton({ periodId }: { periodId: string }) {
  return (
    <form action={softCloseAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <Submit label="Soft close" />
    </form>
  );
}

export function HardLockButton({ periodId }: { periodId: string }) {
  return (
    <form action={hardLockAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <Submit label="Hard lock" />
    </form>
  );
}

export function ReopenForm({ periodId }: { periodId: string }) {
  return (
    <form action={reopenAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <label className="text-[11px] uppercase tracking-[0.12em] text-ink-500">
        Reason
        <input name="reason" required className="mt-1 block border border-cream-400 px-2 py-1 text-sm" />
      </label>
      <label className="text-[11px] uppercase tracking-[0.12em] text-ink-500">
        Ticket
        <input name="ticket" required className="mt-1 block border border-cream-400 px-2 py-1 text-sm" />
      </label>
      <Submit label="Reopen" />
    </form>
  );
}

export function ChecklistSelect({
  periodId,
  code,
  status,
}: {
  periodId: string;
  code: string;
  status: string;
}) {
  return (
    <form action={checklistAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="code" value={code} />
      <select
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border border-cream-400 bg-white px-2 py-1 text-xs"
      >
        <option value="PENDING">Pending</option>
        <option value="DONE">Done</option>
        <option value="NA">N/A</option>
      </select>
    </form>
  );
}
