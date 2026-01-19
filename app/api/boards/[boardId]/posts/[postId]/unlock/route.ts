import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  UNLOCK_COOKIE_NAME,
  readUnlockedPostIds,
  buildUnlockedCookieValue,
} from "@/app/lib/unlockCookie";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params;

  const body = await req.json().catch(() => null);
  const password = (body?.password as string | undefined)?.trim() ?? "";
  if (!password) {
    return NextResponse.json({ message: "password required" }, { status: 400 });
  }

  // 글 존재 확인
  const post = await prisma.post.findFirst({
     where: {
        boardId,
        OR: [{ id: postId }, { slug: postId }],
      },
    select: { id: true, isSecret: true, secretPasswordHash: true },
  });
  if (!post) return NextResponse.json({ message: "not found" }, { status: 404 });

  // 잠금글이 아닌데 unlock 요청 → 그냥 ok
  if (!post.isSecret) {
    return NextResponse.json({ unlocked: true });
  }

  // 비밀글인데 비번 설정이 없으면(데이터 꼬임) → 잠금 해제 불가 처리
  if (!post.secretPasswordHash) {
    return NextResponse.json({ message: "no password set" }, { status: 400 });
  }

  const ok = await bcrypt.compare(password, post.secretPasswordHash);
  if (!ok) return NextResponse.json({ message: "wrong password" }, { status: 401 });

  // 쿠키에 unlock 기록 (세션 쿠키)
  const jar = await cookies();
  const current = readUnlockedPostIds(jar.get(UNLOCK_COOKIE_NAME)?.value);
  const nextValue = buildUnlockedCookieValue([...current, post.id]);

  const res = NextResponse.json({ unlocked: true });
  res.cookies.set(UNLOCK_COOKIE_NAME, nextValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // expires/maxAge 안 줌 => 브라우저 세션 동안만 유지
  });

  return res;
}