import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessControlEnabled, defaultRoleWhenGated, readAccessRole, type AccessRole } from "./access";

export async function currentAccessRole(): Promise<AccessRole> {
  if (!accessControlEnabled()) return "principal";
  const jar = await cookies();
  return readAccessRole(jar.get(ACCESS_COOKIE)?.value) ?? defaultRoleWhenGated();
}
