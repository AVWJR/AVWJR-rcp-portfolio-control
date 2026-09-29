import { resolveActor } from "@/lib/auth/actor";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const PUBLIC_PATH = [/^\/login\/?$/, /^\/unlock\/?$/, /^\/partner\/?$/, /^\/api\//, /^\/favicon/];

export async function AuthWall() {
  const path = (await headers()).get("x-rcp-path") ?? "";
  if (!path || PUBLIC_PATH.some((pattern) => pattern.test(path))) return null;
  const actor = await resolveActor();
  if (actor.kind === "anonymous" || actor.kind === "deactivated") {
    redirect("/login");
  }
  return null;
}
