import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  harringtonRediqRentRollWorkbook,
  harringtonYardiPlReport1Workbook,
  harringtonYardiT12ExtWorkbook,
} from "../tests/fixtures/harrington-rent-roll";
import { hamptonLeaseChargesWorkbook } from "../tests/fixtures/hampton-lease-charges";

const dir = resolve("data/samples/harrington");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "RR_-_Harrington_-_12.31.19_-_Resi.xlsx"), harringtonRediqRentRollWorkbook());
writeFileSync(resolve(dir, "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx"), harringtonYardiT12ExtWorkbook());
writeFileSync(
  resolve(dir, "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx"),
  harringtonYardiPlReport1Workbook(),
);
const hamptonDir = resolve("data/samples/hampton");
mkdirSync(hamptonDir, { recursive: true });
writeFileSync(resolve(hamptonDir, "RR_-_Hampton_Gardens_-_Lease_Charges.xlsx"), hamptonLeaseChargesWorkbook());
console.log(`wrote Harrington sample workbooks to ${dir}`);
console.log(`wrote Hampton Lease Charges sample to ${hamptonDir}`);
