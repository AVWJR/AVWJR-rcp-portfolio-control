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

export const HARRINGTON_BROKER_CSV = `Life at Harrington Park
Rent Roll as of 12/31/2019

Unit,Unit Type,Beds,Baths,SF,Status,Market Rent,Lease Rent,Lease Start,Lease End,Concession
1101,A1,1,1,720,Occupied,1185,1150,01/15/2019,01/14/2020,35
1102,A1,1,1,720,Vacant,1185,0,,,
1201,B2,2,2,980,Current,"$1,375.00","$1,350.00",7/1/2019,6/30/2020,25
`;
