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
