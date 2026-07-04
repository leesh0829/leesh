import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/app/lib/prisma";
import { getSessionEmail } from "@/app/lib/sessionEmail";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  const email = getSessionEmail(session);
  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = getSessionEmail(session);
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}
