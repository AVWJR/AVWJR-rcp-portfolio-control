/**
 * Optional live pass of tests/fixtures/expert-eval.json through the local chat pipeline.
 * Exits 0 when no AI key or gateway is configured. Never calls production.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveExpertProvider } from "../src/lib/expert/ai-enabled";

type EvalItem = {
  id: string;
  feature: string;
  route: string;
  entity: string;
  period: string;
  question: string;
  must_include: string[];
  must_not_include: string[];
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
}

function looksLikeProduction(): boolean {
  const db = process.env.DATABASE_URL ?? "";
  const target = process.env.EXPERT_EVAL_URL ?? "";
  return (
    process.env.VERCEL_ENV === "production" ||
    /vercel\.app/i.test(db) ||
    /vercel\.app/i.test(target) ||
    /avwjr-rcp-portfolio-control/i.test(target)
  );
}

async function main(): Promise<void> {
  const provider = resolveExpertProvider();
  if (provider.provider === "none") {
    console.log("No AI key or gateway configured. Skipping live expert eval.");
    process.exit(0);
  }
  if (looksLikeProduction()) {
    console.error("Refusing to run expert eval against production.");
    process.exit(1);
  }

  const { runExpertChat } = await import("../src/lib/expert/chat");
  const items = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/expert-eval.json"), "utf8")) as EvalItem[];
  const byFeature = new Map<string, { passed: number; total: number }>();
  for (const item of items) {
    const result = await runExpertChat({
      messages: [{ role: "user", content: item.question }],
      context: { pathname: item.route, entityCode: item.entity, periodLabel: item.period },
    });
    const answer = normalize(result.message.content);
    const ok =
      item.must_not_include.every((pattern) => !new RegExp(pattern, "i").test(answer)) &&
      item.must_include.every((pattern) => new RegExp(pattern, "i").test(answer));
    const row = byFeature.get(item.feature) ?? { passed: 0, total: 0 };
    row.total += 1;
    if (ok) row.passed += 1;
    byFeature.set(item.feature, row);
    console.log(`${ok ? "PASS" : "FAIL"} ${item.id}`);
  }
  for (const [feature, row] of byFeature) {
    console.log(`${feature}: ${row.passed}/${row.total}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
