import { build1099Export, type Form1099Export, type Form1099Kind, type VendorInput, type VendorPaymentInput } from "@rcp/tax-bridge";
import { prisma } from "./prisma";

export async function load1099Export(opts: {
  year: number;
  month?: number;
  entityCode?: string;
}): Promise<Form1099Export> {
  const vendors = await prisma.vendor.findMany({ orderBy: { code: "asc" } });
  const payments = await prisma.vendorPayment.findMany({
    where: {
      year: opts.year,
      ...(opts.month !== undefined ? { month: opts.month } : {}),
      ...(opts.entityCode ? { entity: { code: opts.entityCode } } : {}),
    },
    include: { vendor: true, entity: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const vendorInputs: VendorInput[] = vendors.map((v) => ({
    code: v.code,
    name: v.name,
    form1099: (v.form1099 === "NEC" || v.form1099 === "MISC" ? v.form1099 : "NONE") as Form1099Kind,
    tinLast4: v.tinLast4,
    addressLine: v.addressLine,
    city: v.city,
    state: v.state,
    zip: v.zip,
  }));
  const paymentInputs: VendorPaymentInput[] = payments.map((p) => ({
    vendorCode: p.vendor.code,
    entityCode: p.entity.code,
    year: p.year,
    month: p.month,
    amountCents: p.amountCents,
    accountCode: p.accountCode,
    memo: p.memo ?? undefined,
    reportable: p.reportable,
  }));
  return build1099Export({ vendors: vendorInputs, payments: paymentInputs, year: opts.year, month: opts.month });
}

export async function listVendors() {
  return prisma.vendor.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { payments: true } } } });
}
