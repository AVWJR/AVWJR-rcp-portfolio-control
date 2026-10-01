"use client";

/**
 * Sentence-style criteria builder.
 * Library and, later, Models and the optimizer share this component.
 * Hard limits filter. Preference is visible and stored, and stays off until Phase 3.
 */

import {
  CRITERION_GROUPS,
  FIELD_CATALOG,
  OPERATOR_LABEL,
  blankCriterion,
  criteriaSentence,
  fieldDef,
  type Criterion,
  type CriterionField,
  type CriterionOperator,
} from "@/lib/library/criteria";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Preset = { id: string; name: string };

export function CriteriaBuilder({
  criteria,
  onChange,
  passCount,
  totalCount,
  choices,
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
}: {
  criteria: Criterion[];
  onChange: (next: Criterion[]) => void;
  passCount: number;
  totalCount: number;
  choices?: Partial<Record<CriterionField, string[]>>;
  presets?: Preset[];
  onSavePreset?: (name: string) => void;
  onLoadPreset?: (id: string) => void;
  onDeletePreset?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [presetName, setPresetName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_CATALOG.filter((field) => {
      if (!q) return true;
      return `${field.group} ${field.label}`.toLowerCase().includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (open) {
      setHighlight(0);
      const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  function addField(field: CriterionField) {
    onChange([...criteria, blankCriterion(field)]);
    setOpen(false);
    setQuery("");
  }

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = matches[highlight];
      if (pick) addField(pick.field);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <section className="border border-cream-300 bg-white shadow-ledger">
      <div className="border-b border-cream-300 bg-navy-900 px-5 py-4 text-cream-100">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gold-400">Criteria</p>
        <h2 className="font-display text-2xl">Which deals pass</h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        {criteria.length === 0 ? (
          <p className="text-sm text-ink-600">No criteria yet. Every deal is in the count until you add a hard limit.</p>
        ) : (
          <ul className="space-y-2">
            {criteria.map((row) => (
              <li key={row.id}>
                <CriterionRow
                  criterion={row}
                  choices={choices?.[row.field] ?? []}
                  onChange={(next) => onChange(criteria.map((item) => (item.id === row.id ? next : item)))}
                  onRemove={() => onChange(criteria.filter((item) => item.id !== row.id))}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          <button
            type="button"
            className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900 hover:bg-cream-200"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
          >
            + Add criterion
          </button>
          {open ? (
            <div className="absolute z-20 mt-2 w-full max-w-md border border-navy-900 bg-cream-50 shadow-ledger">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKey}
                placeholder="Type to search"
                aria-label="Search criteria"
                aria-controls={listId}
                aria-activedescendant={matches[highlight] ? `${listId}-${matches[highlight].field}` : undefined}
                className="w-full border-b border-cream-300 bg-white px-3 py-2 text-sm text-navy-900"
              />
              <ul id={listId} role="listbox" aria-label="Criterion types" className="max-h-72 overflow-auto py-1">
                {CRITERION_GROUPS.map((group) => {
                  const fields = matches.filter((field) => field.group === group);
                  if (!fields.length) return null;
                  return (
                    <li key={group}>
                      <p className="px-3 pt-2 text-[10px] uppercase tracking-[0.16em] text-gold-700">{group}</p>
                      <ul>
                        {fields.map((field) => {
                          const index = matches.findIndex((row) => row.field === field.field);
                          const active = index === highlight;
                          return (
                            <li key={field.field}>
                              <button
                                id={`${listId}-${field.field}`}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                                  active ? "bg-navy-900 text-cream-50" : "text-navy-900 hover:bg-gold-100"
                                }`}
                                onMouseEnter={() => setHighlight(index)}
                                onClick={() => addField(field.field)}
                              >
                                <span>{field.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
                {matches.length === 0 ? <li className="px-3 py-2 text-sm text-ink-600">No match.</li> : null}
              </ul>
            </div>
          ) : null}
        </div>

        <p className="font-display text-xl text-navy-900" aria-live="polite">
          {passCount} of {totalCount} deals pass
        </p>
        <p className="text-xs text-ink-600">
          Hard limits filter this list. Preference rows are kept for the optimizer and do not exclude a deal in Phase 1.
        </p>

        {onSavePreset && onLoadPreset ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-cream-300 pt-3">
            <label className="text-sm text-ink-700">
              Preset name
              <input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="mt-1 block border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-navy-900"
              />
            </label>
            <button
              type="button"
              className="bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50 disabled:opacity-40"
              disabled={!presetName.trim()}
              onClick={() => {
                onSavePreset(presetName.trim());
                setPresetName("");
              }}
            >
              Save preset
            </button>
            {presets?.length ? (
              <label className="text-sm text-ink-700">
                Saved
                <select
                  className="mt-1 block border border-cream-300 bg-white px-3 py-2 text-sm text-navy-900"
                  value={presetId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setPresetId(id);
                    setConfirmDelete(false);
                    if (id) onLoadPreset(id);
                  }}
                >
                  <option value="">Load a preset</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {onDeletePreset && presets?.length ? (
              <button
                type="button"
                className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900 disabled:opacity-40"
                disabled={!presetId}
                onClick={() => setConfirmDelete(true)}
              >
                Delete preset
              </button>
            ) : null}
            {confirmDelete && presetId ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-800">
                Delete this preset? Deals and documents stay.
                <button
                  type="button"
                  className="bg-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-50"
                  onClick={() => {
                    onDeletePreset?.(presetId);
                    setPresetId("");
                    setConfirmDelete(false);
                  }}
                >
                  Delete preset
                </button>
                <button
                  type="button"
                  className="border border-navy-900 px-3 py-2 text-[12px] uppercase tracking-[0.14em] text-navy-900"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CriterionRow({
  criterion,
  choices,
  onChange,
  onRemove,
}: {
  criterion: Criterion;
  choices: string[];
  onChange: (next: Criterion) => void;
  onRemove: () => void;
}) {
  const def = fieldDef(criterion.field);
  const [opsOpen, setOpsOpen] = useState(false);
  const hard = criterion.role !== "PREFERENCE";

  return (
    <div className="flex flex-wrap items-center gap-2 border border-cream-300 bg-cream-50 px-3 py-2">
      <p className="sr-only">{criteriaSentence(criterion)}</p>
      <span className="text-sm font-semibold text-navy-900">{def.label}</span>
      <div className="relative">
        <button
          type="button"
          className="border border-gold-500 bg-white px-2 py-1 text-sm text-navy-900"
          aria-haspopup="listbox"
          aria-expanded={opsOpen}
          onClick={() => setOpsOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpsOpen(false);
          }}
        >
          {OPERATOR_LABEL[criterion.operator]}
        </button>
        {opsOpen ? (
          <ul
            role="listbox"
            aria-label={`${def.label} operator`}
            className="absolute z-10 mt-1 min-w-24 border border-navy-900 bg-white shadow-ledger"
          >
            {def.operators.map((operator) => (
              <li key={operator}>
                <button
                  type="button"
                  role="option"
                  aria-selected={operator === criterion.operator}
                  className="block w-full px-3 py-1 text-left text-sm text-navy-900 hover:bg-gold-100"
                  onClick={() => {
                    onChange({ ...criterion, operator: operator as CriterionOperator });
                    setOpsOpen(false);
                  }}
                >
                  {OPERATOR_LABEL[operator]}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {def.kind === "text" ? (
        <TextValue
          selected={Array.isArray(criterion.value) ? criterion.value : []}
          choices={choices}
          onChange={(value) => onChange({ ...criterion, value })}
        />
      ) : (
        <input
          type="number"
          aria-label={`${def.label} value`}
          value={typeof criterion.value === "number" ? criterion.value : ""}
          step={def.kind === "integer" ? 1 : 0.01}
          onChange={(event) => onChange({ ...criterion, value: event.target.value === "" ? 0 : Number(event.target.value) })}
          className="w-28 border border-cream-300 bg-white px-2 py-1 text-sm tabular text-navy-900"
        />
      )}
      {def.kind === "multiple" ? <span className="text-sm text-ink-600">x</span> : null}
      {def.kind === "percent" ? <span className="text-sm text-ink-600">%</span> : null}
      <div className="ml-auto flex items-center gap-1" role="group" aria-label="Hard limit or preference">
        <button
          type="button"
          aria-pressed={hard}
          className={`px-2 py-1 text-[11px] uppercase tracking-[0.12em] ${
            hard ? "bg-navy-900 text-cream-50" : "border border-cream-300 text-ink-600"
          }`}
          onClick={() => onChange({ ...criterion, role: "HARD_LIMIT" })}
        >
          Hard limit
        </button>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Optimizer (Phase 3)"
          className="cursor-not-allowed border border-dashed border-cream-400 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-ink-500"
        >
          Preference
          <span className="ml-1 normal-case tracking-normal">Optimizer (Phase 3)</span>
        </button>
      </div>
      <button type="button" className="text-[11px] uppercase tracking-[0.12em] text-navy-800 underline" onClick={onRemove}>
        Remove row
      </button>
    </div>
  );
}

function TextValue({
  selected,
  choices,
  onChange,
}: {
  selected: string[];
  choices: string[];
  onChange: (next: string[]) => void;
}) {
  const options = Array.from(new Set([...choices, ...selected]));
  if (!options.length) {
    return <span className="text-sm text-ink-600">No choices yet. Add one in Lists, or save a metro on a deal.</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {options.map((option) => {
        const on = selected.some((row) => row.toLowerCase() === option.toLowerCase());
        return (
          <label key={option} className={`cursor-pointer border px-2 py-1 text-xs ${on ? "border-navy-900 bg-navy-900 text-cream-50" : "border-cream-300 bg-white text-navy-900"}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => {
                onChange(on ? selected.filter((row) => row.toLowerCase() !== option.toLowerCase()) : [...selected, option]);
              }}
            />
            {option}
          </label>
        );
      })}
    </span>
  );
}
