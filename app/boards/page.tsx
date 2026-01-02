import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BoardsClient from "./BoardsClient"

export const runtime = "nodejs";

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return <div>로그인이 필요합니다.</div>;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) return <div>사용자 없음</div>;

  const boards = await prisma.board.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return <BoardsClient initialBoards={boards} />;
}
