import { utils, write } from "xlsx";

/** Broker-style Harrington Park rent roll: title rows + Resi sheet + decoy cover. */
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

/**
 * Closer to the live broker packet: T12 + Unit Mix decoy tabs, 20 title rows,
 * two-line headers, Bldg/Unit + Occupied Y/N. Filename stays RR_-_…Resi.xlsx.
 */
export function harringtonBrokerPacketWorkbook(): Buffer {
  const cover = utils.aoa_to_sheet([
    ["Life at Harrington Park"],
    ["Offering memorandum"],
    ["Confidential"],
  ]);
  const mix = utils.aoa_to_sheet([
    ["Unit Mix"],
    ["Unit Type", "Count", "SF", "Market Rent", "Occupied"],
    ["A1", "36", "750", "1185", "32"],
    ["B2", "58", "1050", "1375", "50"],
    ["C3", "61", "1200", "1550", "55"],
  ]);
  const t12 = utils.aoa_to_sheet([
    ["T12 NOI", "Trailing twelve months"],
    ["Account", "Nov 2018", "Dec 2018", "Total"],
    ["GPR", "100", "110", "210"],
    ["NOI", "40", "42", "82"],
  ]);
  const title = Array.from({ length: 18 }, (_, i) =>
    i === 0
      ? ["Life at Harrington Park"]
      : i === 1
        ? ["RR - Harrington - 12.31.19 - Resi", "As of 12/31/2019"]
        : i === 2
          ? ["Prepared for offering diligence"]
          : [],
  );
  const headerTop = ["Bldg /", "Unit", "", "", "Market", "Lease", "Lease", "Lease", ""];
  const headerBot = ["Unit", "Type", "Bd/Ba", "SF", "Rent", "Rent", "Start", "End", "Occupied"];
  const units: (string | number)[][] = [];
  const stacks: { type: string; beds: string; baths: string; sf: string; market: number; count: number }[] = [
    { type: "A1", beds: "1", baths: "1", sf: "750", market: 1185, count: 6 },
    { type: "B2", beds: "2", baths: "2", sf: "1050", market: 1375, count: 6 },
    { type: "C3", beds: "3", baths: "2", sf: "1200", market: 1550, count: 6 },
  ];
  let n = 0;
  for (const stack of stacks) {
    for (let i = 0; i < stack.count; i += 1) {
      n += 1;
      const occupied = n % 5 !== 0;
      units.push([
        String(100 + n),
        stack.type,
        `${stack.beds}/${stack.baths}`,
        stack.sf,
        String(stack.market),
        occupied ? String(stack.market - 25) : "0",
        occupied ? "1/1/2019" : "",
        occupied ? "12/31/2019" : "",
        occupied ? "Y" : "N",
      ]);
    }
  }
  const resi = utils.aoa_to_sheet([...title, headerTop, headerBot, ...units]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, cover, "Cover");
  utils.book_append_sheet(wb, mix, "Unit Mix");
  utils.book_append_sheet(wb, t12, "T12 NOI");
  utils.book_append_sheet(wb, resi, "Resi");
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
 * Production-shaped redIQ export (aligned with PR #15): title rows 1–7, human R8,
 * machine R9 (UnitID / OccStatus / MktRent / InPlaceRent), data from R10, ~175 units.
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
