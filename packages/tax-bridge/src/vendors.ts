import {
  FORM_1099_LIMITATIONS,
  TAX_FILING_DISCLAIMER,
  type Form1099Export,
  type Form1099ExportRow,
  type VendorInput,
  type VendorPaymentInput,
} from "./types";

export const AP_VENDOR_STUB =
  "Phase A AP is a control total (2010 / 2020) with no vendor invoice subledger. 1099 export uses the vendor master plus any coded overlay payments. Empty overlay → honest empty export.";

export function build1099Export(opts: {
  vendors: VendorInput[];
  payments: VendorPaymentInput[];
  year: number;
  month?: number;
}): Form1099Export {
  const vendors = new Map(opts.vendors.map((v) => [v.code, v]));
  const rows: Form1099ExportRow[] = [];
  for (const pay of opts.payments) {
    if (opts.month !== undefined && pay.month !== opts.month) continue;
    if (pay.year !== opts.year) continue;
    const vendor = vendors.get(pay.vendorCode);
    if (!vendor) throw new Error(`Unknown vendor ${pay.vendorCode}`);
    rows.push({
      vendorCode: vendor.code,
      vendorName: vendor.name,
      form1099: vendor.form1099,
      tinLast4: vendor.tinLast4 ?? null,
      entityCode: pay.entityCode,
      period: `${pay.year}-${String(pay.month).padStart(2, "0")}`,
      accountCode: pay.accountCode,
      amountCents: pay.amountCents,
      memo: pay.memo ?? "",
      reportable: pay.reportable && vendor.form1099 !== "NONE",
    });
  }
  const reportable = rows.filter((r) => r.reportable);
  const stub = reportable.length === 0;
  return {
    rows,
    totalReportableCents: reportable.reduce((acc, r) => acc + r.amountCents, 0n),
    stub,
    stubReason: stub ? AP_VENDOR_STUB : "",
    limitations: FORM_1099_LIMITATIONS,
    disclaimer: TAX_FILING_DISCLAIMER,
  };
}
