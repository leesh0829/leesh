import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUserId } from "@/app/lib/serverAuth";
import { resolveKisCredentialAuth } from "@/app/lib/kisRouteAuthDecision";

type KisCredentialAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireKisCredential(): Promise<KisCredentialAuthResult> {
  const userId = await getCurrentUserId();
  const cred = userId
    ? await prisma.kisCredential.findUnique({
        where: { userId },
        select: { id: true },
      })
    : null;
  const decision = resolveKisCredentialAuth(userId, !!cred);
  if (!decision.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: decision.message },
        { status: decision.status },
      ),
    };
  }

  return decision;
}
