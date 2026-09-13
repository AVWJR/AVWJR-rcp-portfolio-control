import Link from "next/link";
import { currentAccessRole } from "@/lib/access-server";
import { accessControlEnabled } from "@/lib/access";

export async function AccessBanner() {
  if (!accessControlEnabled()) return null;
  const role = await currentAccessRole();
  if (role === "principal") {
    return (
      <p className="bg-navy-900 px-6 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-gold-400">
        Principal mode — writes enabled
      </p>
    );
  }
  return (
    <p className="bg-gold-500 px-6 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-navy-950">
      Partner view — read only. Dashboards and packs only.{" "}
      <Link href="/unlock" className="underline">
        Principal unlock
      </Link>
    </p>
  );
}
