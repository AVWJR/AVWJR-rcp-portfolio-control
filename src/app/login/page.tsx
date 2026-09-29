import { bootstrapAction, loginAction } from "@/app/actions/session";
import { authSecretConfigured, ownerBootstrapConfigured } from "@/lib/auth/policy";
import { prisma } from "@/lib/prisma";
import { RCP_NAME, RCP_PRODUCT } from "@rcp/rcp-brand";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const userCount = await prisma.appUser.count();
  const needsBootstrap = userCount === 0;
  const secretReady = authSecretConfigured();
  const bootstrapReady = ownerBootstrapConfigured();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.22em] text-gold-700">{RCP_NAME}</p>
      <h1 className="mt-2 font-display text-4xl text-navy-900">{needsBootstrap ? "Create the owner account" : "Sign in"}</h1>
      <p className="mt-3 text-sm text-ink-700">
        {RCP_PRODUCT}. Each person has their own email and password. The shared partner link stays available only until
        the first account exists, unless you explicitly keep it on.
      </p>
      {!secretReady ? (
        <p className="mt-4 border border-gold-500 bg-cream-100 px-4 py-3 text-sm text-ink-800">
          AUTH_SECRET is not set yet. Add it in Vercel (Settings → Environment Variables), redeploy, then come back.
          Logins will not stick until that secret is saved.
        </p>
      ) : null}
      {query.error ? (
        <p className="mt-4 text-sm text-red-800">
          {query.error === "1" ? "That email or password was not accepted." : query.error}
        </p>
      ) : null}
      {needsBootstrap ? (
        <form action={bootstrapAction} className="mt-6 space-y-4 border border-cream-300 bg-white px-5 py-5 shadow-ledger">
          {!bootstrapReady ? (
            <p className="text-sm text-ink-700">
              Set OWNER_EMAIL to the owner&apos;s email and AUTH_SECRET to a long random string, then redeploy. The first
              account must use that email.
            </p>
          ) : (
            <p className="text-sm text-ink-700">Use the email saved as OWNER_EMAIL. Choose a password of at least 10 characters.</p>
          )}
          <label className="block text-sm">
            Name
            <input name="name" className="mt-1 block w-full border border-cream-400 px-3 py-2" placeholder="Vance" />
          </label>
          <label className="block text-sm">
            Email
            <input name="email" type="email" required className="mt-1 block w-full border border-cream-400 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required minLength={10} className="mt-1 block w-full border border-cream-400 px-3 py-2" />
          </label>
          <button type="submit" className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100">
            Create owner and sign in
          </button>
        </form>
      ) : (
        <form action={loginAction} className="mt-6 space-y-4 border border-cream-300 bg-white px-5 py-5 shadow-ledger">
          <label className="block text-sm">
            Email
            <input name="email" type="email" required className="mt-1 block w-full border border-cream-400 px-3 py-2" />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required className="mt-1 block w-full border border-cream-400 px-3 py-2" />
          </label>
          <button type="submit" className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100">
            Sign in
          </button>
        </form>
      )}
    </main>
  );
}
