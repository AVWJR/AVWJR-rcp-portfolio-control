import { prisma } from "@/lib/prisma";
import { isMissingMarketTable } from "./missing";
import {
  MarketsError,
  marketSeedWritesAllowed,
  paidRegistrationFields,
  parsePaidSourceInput,
  refuseProtectedPublicSource,
} from "./policy";
import { scoreDigest } from "./read";
import { MARKETS_PREVIEW_WRITE, MARKETS_SETUP_PENDING, NOT_CONNECTED, REGISTERED_ONLY } from "./types";

export async function registerPaidSource(body: Record<string, unknown>): Promise<{ id: string; message: string }> {
  const input = parsePaidSourceInput(body);
  const fields = paidRegistrationFields(input);
  if (!marketSeedWritesAllowed()) throw new MarketsError(MARKETS_PREVIEW_WRITE, 503);
  let before = "";
  try {
    before = await scoreDigest();
    const existing = (await prisma.mktSource.findMany()).find((row) => row.name.toLowerCase() === input.name.toLowerCase());
    if (existing) {
      refuseProtectedPublicSource(existing);
      await prisma.mktSource.update({
        where: { id: existing.id },
        data: {
          publisher: input.publisher,
          url: input.url,
          termsUrl: input.termsUrl,
          costNotes: input.costNotes,
          licenseBasis: fields.licenseBasis,
          status: fields.status,
          automationAllowed: false,
          paywalled: true,
          notes: `${NOT_CONNECTED} Registered only. Scores unchanged.`,
        },
      });
      await assertScoresUnchanged(before);
      return { id: existing.id, message: REGISTERED_ONLY };
    }
    const created = await prisma.mktSource.create({
      data: {
        name: input.name,
        publisher: input.publisher,
        url: input.url,
        termsUrl: input.termsUrl,
        costNotes: input.costNotes,
        licenseBasis: fields.licenseBasis,
        status: fields.status,
        automationAllowed: false,
        paywalled: true,
        notes: `${NOT_CONNECTED} Registered only. Scores unchanged.`,
        sortOrder: 1000,
      },
    });
    await assertScoresUnchanged(before);
    return { id: created.id, message: REGISTERED_ONLY };
  } catch (error) {
    if (isMissingMarketTable(error)) throw new MarketsError(MARKETS_SETUP_PENDING, 503);
    throw error;
  }
}

async function assertScoresUnchanged(before: string) {
  const after = await scoreDigest();
  if (after !== before) {
    throw new MarketsError("Registering a paid source changed scores.", 500);
  }
}
