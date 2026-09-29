"use server";

import { signIn, signOut } from "@/auth";
import { assertLoginAllowed, clientIpFrom, LoginLockedError } from "@/lib/auth/lockout";
import { bootstrapOwner } from "@/lib/auth/users";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const headerList = await headers();
  const ip = clientIpFrom(new Request("http://localhost", { headers: headerList }));
  try {
    await assertLoginAllowed(email, ip);
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof LoginLockedError) redirect(`/login?error=${encodeURIComponent(error.message)}`);
    if (error instanceof AuthError) redirect("/login?error=1");
    throw error;
  }
}

export async function bootstrapAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  try {
    await bootstrapOwner({ email, password, name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
  try {
    await signIn("credentials", { email, password, redirectTo: "/admin/users" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=1");
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
