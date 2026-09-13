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
