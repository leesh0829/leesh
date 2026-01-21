import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export const runtime = "nodejs";

const COOKIE_NAME = "leesh_unlocked";

async function getOwnerUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return u?.id ?? null;
}

async function getOrCreatePortfolioPost(ownerId: string) {
  const board =
    (await prisma.board.findFirst({
      where: { ownerId, type: "PORTFOLIO" },
      select: { id: true, name: true },
    })) ??
    (await prisma.board.create({
      data: {
        ownerId,
        type: "PORTFOLIO",
        name: "Leesh Portfolio",
        description: "포트폴리오 자기소개서",
      },
      select: { id: true, name: true },
    }));

  const post =
    (await prisma.post.findFirst({
      where: { boardId: board.id, slug: "leesh" },
      select: {
        id: true,
        title: true,
        contentMd: true,
        status: true,
        authorId: true,
        boardId: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    })) ??
    (await prisma.post.create({
      data: {
        boardId: board.id,
        authorId: ownerId,
        title: "자기소개서",
        contentMd: `# Leesh\n\n여기에 자기소개서를 작성하세요.\n`,
        status: "DONE",
        slug: "leesh",
      },
      select: {
        id: true,
        title: true,
        contentMd: true,
        status: true,
        authorId: true,
        boardId: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    }));

  return { board, post };
}

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const unlocked = cookie.includes(`${COOKIE_NAME}=1`);
  if (!unlocked) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const ownerId = await getOwnerUserId();
  if (!ownerId) {
    return NextResponse.json(
      {
        canEdit: false,
        contentMd: "# Leesh\n\n(아직 작성된 문서가 없습니다.)\n",
      },
      { status: 200 },
    );
  }

  const { post } = await getOrCreatePortfolioPost(ownerId);

  const session = await getServerSession(authOptions);
  const me = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null;

  const canEdit = !!me?.id && me.id === ownerId;

  return NextResponse.json({
    id: post.id,
    title: post.title,
    contentMd: post.contentMd,
    updatedAt: post.updatedAt,
    canEdit,
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!me)
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const ownerId = await getOwnerUserId();
  if (!ownerId || me.id !== ownerId) {
    return NextResponse.json({ message: "forbidden" }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const contentMd =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)["contentMd"]
      : null;

  if (typeof contentMd !== "string") {
    return NextResponse.json({ message: "invalid body" }, { status: 400 });
  }

  const { post } = await getOrCreatePortfolioPost(ownerId);

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: { contentMd },
    select: { id: true, title: true, contentMd: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
