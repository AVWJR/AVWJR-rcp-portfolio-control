import { inviteUserAction, updateUserAction } from "@/app/actions/users";
import { logoutAction } from "@/app/actions/session";
import { ReportShell, type ReportSearch } from "@/components/report-frame";
import { resolveActor } from "@/lib/auth/actor";
import { APP_ROLES, roleLabel } from "@/lib/auth/roles";
import { listUsers } from "@/lib/auth/users";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams: Promise<ReportSearch> }) {
  const params = await searchParams;
  const actor = await resolveActor();
  return (
    <ReportShell searchParams={params} pathname="/admin/users">
      {async () => {
        if (actor.role !== "OWNER") {
          return (
            <div>
              <h1 className="font-display text-4xl text-navy-900">Users</h1>
              <p className="mt-3 text-sm text-ink-700">Only the owner can invite people and change roles.</p>
            </div>
          );
        }
        const [users, entities] = await Promise.all([
          listUsers(),
          prisma.entity.findMany({ where: { type: "SPE" }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
        ]);
        return (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-4xl text-navy-900">Users</h1>
                <p className="mt-2 max-w-3xl text-sm text-ink-700">
                  Invite a person, choose what they can do, and for an LP or lender pick the deals they can open.
                  Deactivate someone to turn them off without deleting history. Tell them the password you set — this
                  app does not send email.
                </p>
              </div>
              <form action={logoutAction}>
                <button type="submit" className="border border-navy-900 px-3 py-2 text-[11px] uppercase tracking-[0.14em]">
                  Sign out
                </button>
              </form>
            </div>

            <form action={inviteUserAction} className="space-y-3 border border-cream-300 bg-white px-5 py-4 shadow-ledger">
              <h2 className="font-display text-2xl text-navy-900">Invite</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  Name
                  <input name="name" className="mt-1 block w-full border border-cream-400 px-2 py-1" />
                </label>
                <label className="text-sm">
                  Email
                  <input name="email" type="email" required className="mt-1 block w-full border border-cream-400 px-2 py-1" />
                </label>
                <label className="text-sm">
                  Role
                  <select name="role" className="mt-1 block w-full border border-cream-400 px-2 py-1" defaultValue="PREPARER">
                    {APP_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Starting password
                  <input name="password" type="text" required minLength={10} className="mt-1 block w-full border border-cream-400 px-2 py-1" />
                </label>
              </div>
              <fieldset>
                <legend className="text-sm text-ink-700">Deals for an LP or lender viewer</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {entities.map((entity) => (
                    <label key={entity.code} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="entityCode" value={entity.code} />
                      {entity.code}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="bg-navy-900 px-4 py-2 text-[12px] uppercase tracking-[0.14em] text-cream-100">
                Invite
              </button>
            </form>

            <div className="space-y-4">
              {users.map((user) => (
                <form key={user.id} action={updateUserAction} className="border border-cream-300 bg-white px-5 py-4 shadow-ledger">
                  <input type="hidden" name="id" value={user.id} />
                  <p className="font-display text-2xl text-navy-900">{user.email}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      Name
                      <input name="name" defaultValue={user.name ?? ""} className="mt-1 block w-full border border-cream-400 px-2 py-1" />
                    </label>
                    <label className="text-sm">
                      Role
                      <select name="role" defaultValue={user.role} className="mt-1 block w-full border border-cream-400 px-2 py-1">
                        {APP_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Active
                      <select name="active" defaultValue={user.active ? "yes" : "no"} className="mt-1 block w-full border border-cream-400 px-2 py-1">
                        <option value="yes">Active</option>
                        <option value="no">Deactivated</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      New password
                      <input name="password" type="text" className="mt-1 block w-full border border-cream-400 px-2 py-1" placeholder="Leave blank to keep" />
                    </label>
                  </div>
                  <fieldset className="mt-3">
                    <legend className="text-sm text-ink-700">Deal scope</legend>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {entities.map((entity) => (
                        <label key={entity.code} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="entityCode"
                            value={entity.code}
                            defaultChecked={user.scopes.some((scope) => scope.entity.code === entity.code)}
                          />
                          {entity.code}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className="mt-3 border border-navy-900 px-3 py-2 text-[11px] uppercase tracking-[0.14em]">
                    Save
                  </button>
                </form>
              ))}
            </div>
          </div>
        );
      }}
    </ReportShell>
  );
}
