import Link from "next/link";
import { logoutAction } from "@/app/actions/session";
import { currentAccessRole } from "@/lib/access-server";
import { accessControlEnabled } from "@/lib/access";
import { resolveActor } from "@/lib/auth/actor";
import { roleLabel } from "@/lib/auth/roles";

export async function AccessBanner() {
  const actor = await resolveActor().catch(() => null);
  if (actor?.kind === "user" && actor.role) {
    return (
      <p className="flex items-center justify-center gap-3 bg-navy-900 px-6 py-2 text-center text-[11px] uppercase tracking-[0.16em] text-gold-400">
        <span>
          {actor.name || actor.email} · {roleLabel(actor.role)}
        </span>
        <form action={logoutAction}>
          <button type="submit" className="underline">
            Sign out
          </button>
        </form>
      </p>
    );
  }
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
