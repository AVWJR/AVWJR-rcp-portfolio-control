import { utils, write } from "xlsx";

/** Simple #13-era fixture (title rows + Resi RR). Still valid. */
export function harringtonRentRollWorkbook(): Buffer {
  const cover = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["Offering memorandum exhibits"],
    ["Do not import this tab"],
  ]);
  const resi = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["RR - Harrington - 12.31.19 - Resi", "As of 12/31/2019"],
    [],
    [
      "Unit",
      "Unit Type",
      "Beds",
      "Baths",
      "SF",
      "Status",
      "Market Rent",
      "Lease Rent",
      "Lease Start",
      "Lease End",
      "Concession",
    ],
    ["101", "A1", "1", "1", "750", "Occupied", "1250", "1200", "1/1/2019", "12/31/2019", "50"],
    ["102", "A1", "1", "1", "750", "Vacant", "1250", "0", "", "", ""],
    ["201", "B2", "2", "2", "1050", "Current", "$1,450.00", "$1,425.00", "6/1/2019", "5/31/2020", "$25"],
    ["202", "B2", "2", "2.5", "1100", "Notice", "1450", "1400", "3/15/2019", "3/14/2020", "0"],
    ["301", "C3", "3", "2", "1200", "Down", "0", "0", "", "", ""],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, cover, "Cover");
  utils.book_append_sheet(wb, resi, "Resi RR");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

/**
 * Production-shaped Yardi/MRI Resi rent roll (~the layout that made #13's
 * 5-row fixture pass while SPE-HRP3 stayed at 0 units):
 * cover + summary decoys, sheet named only "Resi", two-row headers,
 * Bldg + Unit, Bd/Ba, Charges (not Lease Rent), comma SF, charge-detail
 * duplicate rows, and a mid-file header reprint.
 */
export function harringtonYardiResiWorkbook(): Buffer {
  const cover = utils.aoa_to_sheet([
    ["Yardi Voyager"],
    ["Life at Harrington Park — Residential Rent Roll"],
    ["As of December 31, 2019"],
    ["Do not import this tab"],
  ]);
  const summary = utils.aoa_to_sheet([
    ["Unit Mix Summary"],
    ["Floorplan", "Count", "Avg SF", "Avg Market"],
    ["A1", "2", "750", "1250"],
    ["B2", "2", "1,075", "1450"],
    ["Total", "5", "", ""],
  ]);
  const resi = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["Residential Rent Roll with Lease Charges"],
    ["As of: 12/31/2019"],
    [],
    ["Unit Information", "", "", "", "Lease Information", "", "", "Rent Information", "", ""],
    ["Bldg", "Unit", "Unit Type", "Bd/Ba", "SQFT", "Resident", "Status", "Lease From", "Lease To", "Market", "Charges"],
    ["1", "101", "A1", "1/1", "750", "Smith, A", "Occupied", "1/1/2019", "12/31/2019", "1,250.000", "1,200.00"],
    ["1", "101", "A1", "1/1", "750", "Smith, A", "Occupied", "1/1/2019", "12/31/2019", "", "25.00"],
    ["1", "102", "A1", "1/1", "750", "Vacant", "Vacant", "", "", "1,250.00", "0"],
    ["1", "201", "B2", "2/2", "1,050", "Lee, B", "Current", "6/1/2019", "5/31/2020", "$1,450.00", "$1,425.00"],
    ["1", "201", "B2", "2/2", "1,050", "Lee, B", "Current", "6/1/2019", "5/31/2020", "", "40.00"],
    ["Bldg", "Unit", "Unit Type", "Bd/Ba", "SQFT", "Resident", "Status", "Lease From", "Lease To", "Market", "Charges"],
    ["1", "202", "B2", "2/2.5", "1,100", "Patel, C", "Notice", "3/15/2019", "3/14/2020", "1450", "1400"],
    ["1", "301", "C3", "3/2", "1,200", "Model", "Down", "", "", "0", "0"],
    ["", "Total", "", "", "", "", "", "", "", "6,400", "4,090"],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, cover, "Cover");
  utils.book_append_sheet(wb, summary, "Summary");
  utils.book_append_sheet(wb, resi, "Resi");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function unmappableWorkbook(): Buffer {
  const ws = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["Trailing twelve months"],
    ["Account", "Nov 2018", "Dec 2018", "Total"],
    ["GPR", "100", "110", "210"],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "T12");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function harringtonT12Workbook(): Buffer {
  const cover = utils.aoa_to_sheet([["Life at Harrington Park"], ["T12 exhibits"], ["Skip"]]);
  const t12 = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["T12 NOI — Dec 2018 to Nov 2019"],
    [],
    [
      "Account Description",
      "Dec 2018",
      "Jan 2019",
      "Feb 2019",
      "Mar 2019",
      "Apr 2019",
      "May 2019",
      "Jun 2019",
      "Jul 2019",
      "Aug 2019",
      "Sep 2019",
      "Oct 2019",
      "Nov 2019",
      "T12 Total",
    ],
    ["Income", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Gross Potential Rent", ...Array.from({ length: 12 }, () => "180000"), "2160000"],
    ["Vacancy Loss", ...Array.from({ length: 12 }, () => "(9000)"), "108000"],
    ["Concessions", ...Array.from({ length: 12 }, () => "3000"), "36000"],
    ["Other Income", ...Array.from({ length: 12 }, () => "8000"), "96000"],
    ["Effective Gross Income", ...Array.from({ length: 12 }, () => "176000"), "2112000"],
    ["Operating Expenses", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Payroll", ...Array.from({ length: 12 }, () => "22000"), "264000"],
    ["Repairs & Maintenance", ...Array.from({ length: 12 }, () => "12000"), "144000"],
    ["Utilities", ...Array.from({ length: 12 }, () => "14000"), "168000"],
    ["Contract Services", ...Array.from({ length: 12 }, () => "6000"), "72000"],
    ["Marketing", ...Array.from({ length: 12 }, () => "2500"), "30000"],
    ["Administrative", ...Array.from({ length: 12 }, () => "4000"), "48000"],
    ["Insurance", ...Array.from({ length: 12 }, () => "7000"), "84000"],
    ["Real Estate Taxes", ...Array.from({ length: 12 }, () => "18000"), "216000"],
    ["Management Fee", ...Array.from({ length: 12 }, () => "8000"), "96000"],
    ["NOI", ...Array.from({ length: 12 }, () => "82500"), "990000"],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, cover, "Cover");
  utils.book_append_sheet(wb, t12, "T12 NOI");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

export const HARRINGTON_BROKER_CSV = `Life at Harrington Park
Rent Roll as of 12/31/2019

Unit,Unit Type,Beds,Baths,SF,Status,Market Rent,Lease Rent,Lease Start,Lease End,Concession
1101,A1,1,1,720,Occupied,1185,1150,01/15/2019,01/14/2020,35
1102,A1,1,1,720,Vacant,1185,0,,,
1201,B2,2,2,980,Current,"$1,375.00","$1,350.00",7/1/2019,6/30/2020,25
`;

export const HARRINGTON_REDIQ_UNIT_COUNT = 175;

const REDIQ_PLANS = [
  { id: "A1", beds: 1, baths: 1, sf: 720, mkt: 1185 },
  { id: "A2", beds: 1, baths: 1.5, sf: 780, mkt: 1225 },
  { id: "B1", beds: 2, baths: 2, sf: 980, mkt: 1375 },
  { id: "B2", beds: 2, baths: 2.5, sf: 1050, mkt: 1450 },
  { id: "C1", beds: 3, baths: 2, sf: 1200, mkt: 1650 },
] as const;

export type HarringtonRediqUnit = {
  unitId: string;
  planId: string;
  netSf: number;
  bed: number;
  bath: number;
  occStatus: "Occupied" | "Vacant" | "Down";
  mktRent: number;
  inPlaceRent: number;
  recConc: number;
  leaseSign: string;
  leaseExp: string;
  moveIn: string;
};

export function buildHarringtonRediqUnits(): HarringtonRediqUnit[] {
  const buildings = ["A", "B", "C", "D", "E", "F", "G"] as const;
  const units: HarringtonRediqUnit[] = [];
  for (const bldg of buildings) {
    for (let n = 1; n <= 25; n += 1) {
      const idx = units.length;
      const plan = REDIQ_PLANS[idx % REDIQ_PLANS.length]!;
      const vacant = n === 7 || n === 19;
      const down = n === 25;
      const occStatus = down ? "Down" : vacant ? "Vacant" : "Occupied";
      const inPlace = occStatus === "Occupied" ? plan.mkt - (idx % 5) * 5 : 0;
      units.push({
        unitId: `${bldg}-${String(n).padStart(2, "0")}`,
        planId: plan.id,
        netSf: plan.sf,
        bed: plan.beds,
        bath: plan.baths,
        occStatus,
        mktRent: plan.mkt,
        inPlaceRent: inPlace,
        recConc: occStatus === "Occupied" && idx % 11 === 0 ? 25 : 0,
        leaseSign: occStatus === "Occupied" ? `1/${(idx % 12) + 1}/2019` : "",
        leaseExp: occStatus === "Occupied" ? `12/${(idx % 28) + 1}/2019` : "",
        moveIn: occStatus === "Occupied" ? `1/${(idx % 12) + 2}/2019` : "",
      });
    }
  }
  return units;
}

const REDIQ_HUMAN_HEADERS = [
  "Property",
  "Unit No.",
  "Floor Plan",
  "Net sf",
  "Bed",
  "Bath",
  "Lease Type",
  "Status(renovation)",
  "Status(occupancy)",
  "Rent(market)",
  "Rent(contractual)",
  "Rec. Conc",
  "Net Eff. Rent",
  "Lease Sign",
  "Lease Exp",
  "Move-In",
];

const REDIQ_MACHINE_HEADERS = [
  "PropName",
  "UnitID",
  "PlanID",
  "NetSF",
  "Bed",
  "Bath",
  "LeaseType",
  "RenStatus",
  "OccStatus",
  "MktRent",
  "InPlaceRent",
  "RecConc",
  "NetEffRent",
  "LeaseSign",
  "LeaseExp",
  "MoveInDate",
];

function rediqDataRow(unit: HarringtonRediqUnit): (string | number)[] {
  const netEff = unit.inPlaceRent - unit.recConc;
  return [
    "The Life at Harrington Park",
    unit.unitId,
    unit.planId,
    unit.netSf,
    unit.bed,
    unit.bath,
    unit.occStatus === "Occupied" ? "Market" : "",
    unit.occStatus === "Down" ? "Model" : "",
    unit.occStatus,
    unit.mktRent,
    unit.inPlaceRent,
    unit.recConc,
    netEff,
    unit.leaseSign,
    unit.leaseExp,
    unit.moveIn,
  ];
}

/**
 * Production-shaped redIQ export: title rows 1–7, human R8, machine R9 (UnitID /
 * OccStatus / MktRent / InPlaceRent), data from R10. ~175 units. Prefer sheet
 * `Rent Roll`; `Source Data` is the documented alternate.
 */
export function harringtonRediqRentRollWorkbook(): Buffer {
  const units = buildHarringtonRediqUnits();
  const mix = REDIQ_PLANS.map((plan) => {
    const rows = units.filter((u) => u.planId === plan.id);
    return [plan.id, rows.length, plan.sf, plan.mkt];
  });

  const floorPlan = utils.aoa_to_sheet([
    ["redIQ"],
    ["Floor Plan Summary"],
    ["The Life at Harrington Park"],
    ["As of 12/31/2019"],
    [],
    ["Floor Plan", "Count", "Avg Net sf", "Avg Market"],
    ...mix,
    ["Total", units.length, "", ""],
  ]);

  const rentRoll = utils.aoa_to_sheet([
    ["redIQ"],
    ["Rent Roll Export"],
    ["The Life at Harrington Park"],
    ["RR - Harrington - 12.31.19 - Resi"],
    ["As of 12/31/2019"],
    ["Do not treat row 1 as unit_id"],
    [""],
    REDIQ_HUMAN_HEADERS,
    REDIQ_MACHINE_HEADERS,
    ...units.map(rediqDataRow),
    REDIQ_MACHINE_HEADERS,
    ["Total", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ]);

  const sourceData = utils.aoa_to_sheet([
    ["redIQ"],
    ["Source Data"],
    ["The Life at Harrington Park"],
    ["Alternate rent-roll extract"],
    ["As of 12/31/2019"],
    [""],
    [""],
    [""],
    [""],
    [""],
    [""],
    ["UnitID", "PlanID", "NetSF", "OccStatus", "MktRent", "LeaseSign", "LeaseExp", "MoveInDate", "Code1"],
    ...units.map((unit) => [
      unit.unitId,
      unit.planId,
      unit.netSf,
      unit.occStatus,
      unit.mktRent,
      unit.leaseSign,
      unit.leaseExp,
      unit.moveIn,
      unit.inPlaceRent,
    ]),
  ]);

  const sheet2 = utils.aoa_to_sheet([["Scratch"], ["not a rent roll"]]);
  const about = utils.aoa_to_sheet([
    ["About"],
    ["Exported from redIQ"],
    ["Property: The Life at Harrington Park"],
    ["Units: 175"],
  ]);

  const wb = utils.book_new();
  utils.book_append_sheet(wb, floorPlan, "Floor Plan");
  utils.book_append_sheet(wb, rentRoll, "Rent Roll");
  utils.book_append_sheet(wb, sourceData, "Source Data");
  utils.book_append_sheet(wb, sheet2, "Sheet2");
  utils.book_append_sheet(wb, about, "About");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

const T12_MONTHS = [
  "Dec-18",
  "Jan-19",
  "Feb-19",
  "Mar-19",
  "Apr-19",
  "May-19",
  "Jun-19",
  "Jul-19",
  "Aug-19",
  "Sep-19",
  "Oct-19",
  "Nov-19",
] as const;

const T12_LINES: { label: string; monthly: number }[] = [
  { label: "4022-000 Unit Rent", monthly: 180000 },
  { label: "4030-000 Vacancy Loss", monthly: 9000 },
  { label: "4035-000 Concessions", monthly: 3000 },
  { label: "4120-000 Laundry Income", monthly: 3500 },
  { label: "4130-000 Parking Income", monthly: 4500 },
  { label: "5120-000 Payroll", monthly: 22000 },
  { label: "5220-000 Repairs & Maintenance", monthly: 12000 },
  { label: "5320-000 Utilities", monthly: 14000 },
  { label: "5420-000 Contract Services", monthly: 6000 },
  { label: "5520-000 Marketing", monthly: 2500 },
  { label: "5620-000 Administrative", monthly: 4000 },
  { label: "5720-000 Insurance", monthly: 7000 },
  { label: "5820-000 Real Estate Taxes", monthly: 18000 },
  { label: "5920-000 Management Fee", monthly: 8000 },
];

function yardiMonthlyRow(label: string, monthly: number, paren = false): (string | number)[] {
  const cell = paren ? `(${monthly})` : monthly;
  return [label, ...Array.from({ length: 12 }, () => cell), monthly * 12];
}

/** Yardi-style T12 (sheet `ext`) — Dec 2018–Nov 2019, cash-book codes + Total. */
export function harringtonYardiT12ExtWorkbook(): Buffer {
  const cover = utils.aoa_to_sheet([["The Life at Harrington Park"], ["Skip"]]);
  const ext = utils.aoa_to_sheet([
    ["The Life at Harrington Park"],
    ["Income Statement"],
    ["Period Dec 2018–Nov 2019"],
    [],
    ["Account", ...T12_MONTHS, "Total"],
    ["4000-000 Income", ...Array.from({ length: 13 }, () => "")],
    yardiMonthlyRow("4022-000 Unit Rent", 180000),
    yardiMonthlyRow("4030-000 Vacancy Loss", 9000, true),
    yardiMonthlyRow("4035-000 Concessions", 3000),
    ["4100-000 Other Income", ...Array.from({ length: 13 }, () => "")],
    yardiMonthlyRow("4120-000 Laundry Income", 3500),
    yardiMonthlyRow("4130-000 Parking Income", 4500),
    ["5000-000 Operating Expenses", ...Array.from({ length: 13 }, () => "")],
    ...T12_LINES.filter((row) => row.label.startsWith("5")).map((row) => yardiMonthlyRow(row.label, row.monthly)),
    ["Net Operating Income", ...Array.from({ length: 12 }, () => 82500), 990000],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, cover, "Cover");
  utils.book_append_sheet(wb, ext, "ext");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Yardi-style P&L (sheet `Report1`) — same period, Excel-ish month dates. */
export function harringtonYardiPlReport1Workbook(): Buffer {
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2018, 11 + i, 1)));
  const report = utils.aoa_to_sheet([
    ["The Life at Harrington Park"],
    ["Profit and Loss"],
    ["Period Dec 2018 to Nov 2019"],
    [],
    ["Account", ...months, "Total"],
    yardiMonthlyRow("4022-000 Unit Rent", 180000),
    yardiMonthlyRow("4030-000 Vacancy Loss", 9000, true),
    yardiMonthlyRow("4035-000 Concessions", 3000),
    yardiMonthlyRow("4120-000 Laundry Income", 3500),
    yardiMonthlyRow("4130-000 Parking Income", 4500),
    ...T12_LINES.filter((row) => row.label.startsWith("5")).map((row) => yardiMonthlyRow(row.label, row.monthly)),
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, report, "Report1");
  return Buffer.from(write(wb, { type: "buffer", bookType: "xlsx" }));
}
