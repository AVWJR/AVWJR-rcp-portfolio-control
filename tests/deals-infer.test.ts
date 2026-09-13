import {
  classifyFromFilename,
  dealNameToStem,
  inferAsOfDate,
  inferDealIdentity,
  suggestDealSpeCode,
} from "@/lib/deals/infer";
import { suggestIdentityFromFilenames } from "@/lib/deals/upload-client";
import { describe, expect, it } from "vitest";

const HARRINGTON = [
  "Life_at_Harrington_Park_OM_Offering.pdf",
  "PL_-_The_Life_at_Harrington_Park_-_Dec_2018_to_Nov_2019.xlsx",
  "RR_-_Harrington_-_12.31.19_-_Resi.xlsx",
  "T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx",
];

describe("Add Deal filename inference", () => {
  it("classifies Harrington-style prefixes", () => {
    expect(classifyFromFilename(HARRINGTON[0]!)).toBe("om_cim");
    expect(classifyFromFilename(HARRINGTON[1]!)).toBe("t12_pl");
    expect(classifyFromFilename(HARRINGTON[2]!)).toBe("rent_roll_csv");
    expect(classifyFromFilename(HARRINGTON[3]!)).toBe("t12_pl");
  });

  it("infers Life at Harrington Park and an SPE-HRP style code", () => {
    expect(suggestIdentityFromFilenames(HARRINGTON)).toMatch(/Harrington Park/i);
    const inferred = inferDealIdentity(HARRINGTON);
    expect(inferred.speName).toMatch(/Harrington Park/i);
    expect(inferred.speName).not.toMatch(/offering/i);
    expect(inferred.address).toBeNull();
    expect(inferred.notes.some((note) => /address/i.test(note))).toBe(true);
    expect(dealNameToStem(inferred.speName ?? "")).toBe("HRP");
    expect(suggestDealSpeCode(inferred.speName ?? "")).toBe("SPE-HRP");
    expect(inferred.files.find((f) => f.filename.startsWith("RR_"))?.asOfDate).toBe("2019-12-31");
    expect(inferAsOfDate("T12_NOI_-_Life_at_Harrington_-_11.2019.xlsx")).toBe("2019-11-01");
  });
});
