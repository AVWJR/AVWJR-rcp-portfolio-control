import type { BooksToTaxWorksheet, CapitalRollforward, Form1099Export, SheetCell, WorkbookSheet } from "./types";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const body = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return neg ? `-${body}` : body;
}

function cellText(value: SheetCell): string {
  if (value === null) return "";
  if (typeof value === "bigint") return formatCents(value);
  return String(value);
}

export function sheetToCsv(sheet: WorkbookSheet): string {
  return sheet.rows.map((row) => row.map((c) => csvEscape(cellText(c))).join(",")).join("\n") + "\n";
}

/** Excel 2003 SpreadsheetML — opens in Excel / Sheets as a workbook. */
export function sheetsToExcelXml(sheets: WorkbookSheet[]): string {
  const body = sheets
    .map((sheet) => {
      const rows = sheet.rows
        .map((row) => {
          const cells = row
            .map((c) => {
              if (typeof c === "bigint" || typeof c === "number") {
                const n = typeof c === "bigint" ? Number(c) / 100 : c;
                return `<Cell><Data ss:Type="Number">${n}</Data></Cell>`;
              }
              const text = cellText(c)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
              return `<Cell><Data ss:Type="String">${text}</Data></Cell>`;
            })
            .join("");
          return `<Row>${cells}</Row>`;
        })
        .join("");
      const name = sheet.name.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 31) || "Sheet1";
      return `<Worksheet ss:Name="${name}"><Table>${rows}</Table></Worksheet>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${body}
</Workbook>
`;
}

export function worksheetToSheets(ws: BooksToTaxWorksheet): WorkbookSheet[] {
  return [
    {
      name: "Books-to-tax",
      rows: [
        ["DISCLAIMER", ws.disclaimer],
        ["Entity", ws.entityCode, ws.entityName],
        ["Period", ws.period],
        ["View", ws.viewLabel],
        [],
        ["Line", "Basis (BOOKS / TAX / BRIDGE)", "Books USD", "Tax USD", "Adjustment (tax − books)", "MACRS class", "MACRS years", "Account", "Notes"],
        ...ws.lines.map((l) => [
          l.label,
          l.basis,
          l.booksCents,
          l.taxCents,
          l.adjustmentCents,
          l.macrsClass ?? "",
          l.macrsLifeYears ?? "",
          l.accountCode ?? "",
          l.notes ?? "",
        ]),
      ],
    },
  ];
}

export function capitalToSheets(roll: CapitalRollforward): WorkbookSheet[] {
  return [
    {
      name: "K-1 capital",
      rows: [
        ["DISCLAIMER", roll.disclaimer],
        ["LIMITATIONS", ...roll.limitations],
        ["Entity", roll.entityCode, roll.entityName],
        ["Period", roll.period],
        ["Identity", "beginning + contributions − distributions ± book NI = ending"],
        [],
        [
          "Partner code",
          "Partner name",
          "Role",
          "Ownership bps",
          "TIN last4",
          "Beginning",
          "Contributions",
          "Distributions",
          "Book NI allocation",
          "Ending",
          "Identity holds",
        ],
        ...roll.rows.map((r) => [
          r.partnerCode,
          r.partnerName,
          r.role,
          r.ownershipBps,
          r.tinLast4 ?? "",
          r.beginningCents,
          r.contributionsCents,
          r.distributionsCents,
          r.bookNiAllocCents,
          r.endingCents,
          r.identityHolds ? "Y" : "N",
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          roll.totals.beginningCents,
          roll.totals.contributionsCents,
          roll.totals.distributionsCents,
          roll.totals.bookNiAllocCents,
          roll.totals.endingCents,
          roll.totals.identityHolds ? "Y" : "N",
        ],
      ],
    },
  ];
}

export function form1099ToSheets(exp: Form1099Export): WorkbookSheet[] {
  return [
    {
      name: "1099 overlay",
      rows: [
        ["DISCLAIMER", exp.disclaimer],
        ["STUB", exp.stub ? exp.stubReason : "Vendor-coded overlay present"],
        ["LIMITATIONS", ...exp.limitations],
        [],
        [
          "Vendor code",
          "Vendor name",
          "Form",
          "TIN last4",
          "Entity",
          "Period",
          "Account",
          "Amount",
          "Reportable",
          "Memo",
        ],
        ...exp.rows.map((r) => [
          r.vendorCode,
          r.vendorName,
          r.form1099,
          r.tinLast4 ?? "",
          r.entityCode,
          r.period,
          r.accountCode,
          r.amountCents,
          r.reportable ? "Y" : "N",
          r.memo,
        ]),
        ["TOTAL REPORTABLE", "", "", "", "", "", "", exp.totalReportableCents],
      ],
    },
  ];
}
