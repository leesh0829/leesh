import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import BoardsClient from "./BoardsClient";

export const runtime = "nodejs";

export default async function BoardsPage() {
  const session = await getServerSession(authOptions);
  const canCreate = !!session?.user?.email;

  const boards = await prisma.board.findMany({
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true, email: true } } },
  });

  return <BoardsClient initialBoards={boards} canCreate={canCreate} />;
}