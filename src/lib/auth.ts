import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { getClientIp, isIpRateLimited } from "@/lib/rate-limit";
import { checkCredentials } from "@/lib/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    // Credentials provider requires JWT sessions in Auth.js. Immediate
    // revocation (disable / password reset) is implemented separately via
    // User.tokenVersion, checked on every request in the jwt callback.
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // refresh the cookie at most hourly
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const ip = getClientIp(request.headers);
        if (isIpRateLimited(ip)) return null;

        const result = await checkCredentials(email, password);
        if (!result.ok) return null;

        const user = result.user;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          schoolId: user.schoolId,
          tokenVersion: user.tokenVersion,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.schoolId = user.schoolId ?? null;
        token.tokenVersion = user.tokenVersion;
        token.mustChangePassword = user.mustChangePassword;
        token.valid = true;
        return token;
      }

      // Re-validate against the database on every request so a disabled
      // account or a password reset takes effect immediately, without
      // waiting for the JWT to expire.
      if (typeof token.id === "string") {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
        if (!dbUser || dbUser.isDisabled || dbUser.tokenVersion !== token.tokenVersion) {
          token.valid = false;
        } else {
          token.role = dbUser.role;
          token.schoolId = dbUser.schoolId ?? null;
          token.mustChangePassword = dbUser.mustChangePassword;
          token.valid = true;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = token.role as "ADMIN" | "EDITOR";
        session.user.schoolId = (token.schoolId as string | null) ?? null;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.isValid = token.valid !== false;
      }
      return session;
    },
  },
});
