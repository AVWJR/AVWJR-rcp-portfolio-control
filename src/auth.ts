import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authSecretConfigured } from "@/lib/auth/policy";
import { authenticateCredentials } from "@/lib/auth/users";

const configuredSecret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // A placeholder keeps `next build` working before AUTH_SECRET is set.
  // Sessions are refused until a real secret is configured, so this value cannot mint a login.
  secret: configuredSecret.length >= 16 ? configuredSecret : "rcp-auth-secret-not-configured",
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!authSecretConfigured()) return null;
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        const user = await authenticateCredentials(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (!authSecretConfigured()) return {};
      if (user) {
        token.sub = user.id;
        token.role = (user as { role?: string }).role ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = typeof token.role === "string" ? token.role : "";
      }
      return session;
    },
  },
});
