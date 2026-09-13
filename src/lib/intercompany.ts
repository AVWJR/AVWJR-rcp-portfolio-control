import { reviewIntercompany, type IntercompanyReview } from "@rcp/ledger";
import { prisma } from "./prisma";
import { loadPostedLines } from "./queries";

export async function reviewTreeIntercompany(through: Date): Promise<IntercompanyReview> {
  const entities = await prisma.entity.findMany({
    where: {
      OR: [{ type: "OPCO" }, { type: "SPE", lifecycleStatus: "LIVE" }],
    },
    orderBy: { code: "asc" },
  });
  const packed = [];
  for (const entity of entities) {
    packed.push({
      code: entity.code,
      type: entity.type,
      lines: await loadPostedLines({ entityIds: [entity.id], through }),
    });
  }
  return reviewIntercompany(packed);
}
