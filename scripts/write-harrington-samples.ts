import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  harringtonRediqRentRollWorkbook,
  harringtonYardiPlReport1Workbook,
  harringtonYardiT12ExtWorkbook,
} from "../tests/fixtures/harrington-rent-roll";

const dir = resolve("data/samples/harrington");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "RR_-_Harrington_-_12.31.19_-_Resi.xlsx"), harringtonRediqRentRollWorkbook());
writeFileSync(resolve(dir, "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx"), harringtonYardiT12ExtWorkbook());
writeFileSync(
  resolve(dir, "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx"),
  harringtonYardiPlReport1Workbook(),
);
console.log(`wrote Harrington sample workbooks to ${dir}`);
