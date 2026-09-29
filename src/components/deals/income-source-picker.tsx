"use client";

import { DEFAULT_INCOME_STATEMENT_LABEL, SUPERSEDED_INCOME_LABEL } from "@/lib/close/income-source";
import { useState } from "react";

export function IncomeSourcePicker({
  files,
  defaultId,
}: {
  files: { id: string; filename: string; classification: string }[];
  defaultId: string;
}) {
  const [selected, setSelected] = useState(defaultId);
  if (files.length < 2) return null;
  const defaultFile = files.find((file) => file.id === defaultId);
  const defaultLabel =
    defaultFile?.classification === "income_statement" ? DEFAULT_INCOME_STATEMENT_LABEL : "Default, most recent income file";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-navy-900">Income source</legend>
      <p className="max-w-3xl text-sm text-ink-700">
        One income file posts for this month. The default is the most recent income statement. A T12 posts only if you
        select it, and then only that month’s column.
      </p>
      {files.map((file) => {
        const picked = file.id === selected;
        const isDefault = file.id === defaultId;
        return (
          <label key={file.id} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="incomeUploadId"
              value={file.id}
              checked={picked}
              onChange={() => setSelected(file.id)}
            />
            <span>
              {file.filename}
              {isDefault ? ` — ${defaultLabel}` : ""}
              {picked ? "" : ` — ${SUPERSEDED_INCOME_LABEL}`}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
