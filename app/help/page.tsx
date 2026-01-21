import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

async function getOwnerUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

export default async function HelpPage() {
  const ownerId = await getOwnerUserId();
  if (!ownerId) {
    return (
      <main style={{ padding: 24 }}>
        <h1>/help</h1>
        <p style={{ opacity: 0.7 }}>
          아직 유저가 없어서 보드를 만들 수 없습니다.
        </p>
      </main>
    );
  }

  const name = "개발/버그 수정 요청";

  const board =
    (await prisma.board.findFirst({
      where: { ownerId, name, type: "GENERAL" },
      select: { id: true },
    })) ??
    (await prisma.board.create({
      data: {
        ownerId,
        type: "GENERAL",
        name,
        description: "개발/버그 수정 요청 사항을 남기는 게시판",
      },
      select: { id: true },
    }));

  redirect(`/boards/${board.id}`);
}
