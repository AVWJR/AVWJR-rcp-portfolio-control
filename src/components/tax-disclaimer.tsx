import { TAX_FILING_DISCLAIMER } from "@rcp/tax-bridge";

export function TaxDisclaimer({ extra }: { extra?: string }) {
  return (
    <aside className="border border-gold-500 bg-gold-100 px-4 py-3 text-sm text-navy-900">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-800">CPA support — does not file</p>
      <p className="mt-1">{TAX_FILING_DISCLAIMER}</p>
      {extra ? <p className="mt-1 text-ink-700">{extra}</p> : null}
    </aside>
  );
}

export function ExportLinks({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <a className="text-navy-700 underline" href={`${href}&format=csv`}>
        Download {label} CSV
      </a>
      <a className="text-navy-700 underline" href={`${href}&format=xls`}>
        Download {label} Excel
      </a>
    </div>
  );
}
