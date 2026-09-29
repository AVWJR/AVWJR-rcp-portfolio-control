"use client";

import { DEFAULT_BALANCE_SHEET_LABEL } from "@/lib/close/balance-source";
import { DEFAULT_INCOME_STATEMENT_LABEL, SUPERSEDED_INCOME_LABEL } from "@/lib/close/income-source";
import { useState } from "react";

type SourceFile = {
  id: string;
  filename: string;
  classification: string;
  blocksPosting: boolean;
};

export function CloseSourcePicker({
  legend,
  name,
  hint,
  files,
  selectedId,
  automaticId,
  automaticLabel,
  newerNotice,
  requireChoice = false,
}: {
  legend: string;
  name: string;
  hint: string;
  files: SourceFile[];
  selectedId: string;
  automaticId: string | null;
  automaticLabel: string | null;
  newerNotice: string | null;
  requireChoice?: boolean;
}) {
  const selectable = files.filter((file) => !file.blocksPosting);
  const initial = selectable.some((file) => file.id === selectedId)
    ? selectedId
    : requireChoice
      ? ""
      : (selectable[0]?.id ?? "");
  const [selected, setSelected] = useState(initial);
  if (files.length < 2 && !requireChoice) {
    return newerNotice ? <p className="text-sm font-medium text-navy-900">{newerNotice}</p> : null;
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-navy-900">{legend}</legend>
      <p className="max-w-3xl text-sm text-ink-700">{hint}</p>
      {newerNotice ? <p className="max-w-3xl text-sm font-medium text-navy-900">{newerNotice}</p> : null}
      {files.map((file) => {
        if (file.blocksPosting) {
          return (
            <p key={file.id} className="text-sm text-ink-700">
              {file.filename} — blocked, cannot be chosen
            </p>
          );
        }
        const picked = file.id === selected;
        const showAutomatic = picked && file.id === automaticId && automaticLabel;
        return (
          <label key={file.id} className="flex items-start gap-2 text-sm">
            <input type="radio" name={name} value={file.id} checked={picked} onChange={() => setSelected(file.id)} />
            <span>
              {file.filename}
              {showAutomatic ? ` — ${automaticLabel}` : ""}
              {picked ? "" : ` — ${SUPERSEDED_INCOME_LABEL}`}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function IncomeSourcePicker({
  files,
  selectedId,
  automaticId,
  newerNotice,
  requireChoice = false,
}: {
  files: SourceFile[];
  selectedId: string;
  automaticId: string | null;
  newerNotice: string | null;
  requireChoice?: boolean;
}) {
  const automatic = files.find((file) => file.id === automaticId);
  const automaticLabel =
    automatic?.classification === "income_statement"
      ? DEFAULT_INCOME_STATEMENT_LABEL
      : automatic
        ? "Default, most recent income file"
        : null;
  return (
    <CloseSourcePicker
      legend="Income source"
      name="incomeUploadId"
      hint="One income file posts for this month. Until you choose a file, the default is the most recent income statement. A choice you post is saved for this SPE and period, and a newer upload does not replace it."
      files={files}
      selectedId={selectedId}
      automaticId={automaticId}
      automaticLabel={automaticLabel}
      newerNotice={newerNotice}
      requireChoice={requireChoice}
    />
  );
}

export function BalanceSourcePicker({
  files,
  selectedId,
  automaticId,
  newerNotice,
  requireChoice = false,
}: {
  files: SourceFile[];
  selectedId: string;
  automaticId: string | null;
  newerNotice: string | null;
  requireChoice?: boolean;
}) {
  return (
    <CloseSourcePicker
      legend="Balance sheet source"
      name="balanceUploadId"
      hint="One balance sheet posts for this month. Until you choose a file, the default is the most recent balance sheet. A choice you post is saved for this SPE and period, and a newer upload does not replace it."
      files={files}
      selectedId={selectedId}
      automaticId={automaticId}
      automaticLabel={automaticId ? DEFAULT_BALANCE_SHEET_LABEL : null}
      newerNotice={newerNotice}
      requireChoice={requireChoice}
    />
  );
}
