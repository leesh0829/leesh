import Credentials from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcrypt";
import { prisma } from "@/app/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";

const isProd = process.env.NODE_ENV === "production";
if (isProd && !process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET is required in production");
}
if (isProd && !process.env.NEXTAUTH_URL && !process.env.APP_URL) {
  throw new Error("NEXTAUTH_URL or APP_URL is required in production");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique(
          { 
            where: { email },
            select: { 
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              emailVerified: true,
            }
          });
        if (!user?.password) return null;

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  pages: { signIn: "/login" },
};
