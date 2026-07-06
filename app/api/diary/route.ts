import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { toISOStringSafe } from "@/app/lib/date";
import { z } from "zod";
import { badRequestFromZod, parseJsonWithSchema } from "@/app/lib/validation";
import { getCurrentUserId } from "@/app/lib/serverAuth";

export const runtime = "nodejs";

// "YYYY-MM-DD" 형식이면서 실제로 존재하는 날짜인지 검증
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid date")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "invalid date");

const diaryUpsertSchema = z
  .object({
    date: dateSchema,
    contentMd: z.string().max(50000, "내용이 너무 깁니다."),
  })
  .strict();

export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsedDate = dateSchema.safeParse(url.searchParams.get("date"));
  if (!parsedDate.success) {
    return NextResponse.json({ message: "invalid date" }, { status: 400 });
  }
  const date = parsedDate.data;

  const entry = await prisma.diaryEntry.findUnique({
    where: { userId_date: { userId, date } },
    select: { contentMd: true, updatedAt: true },
  });

  return NextResponse.json({
    date,
    contentMd: entry?.contentMd ?? "",
    updatedAt: entry ? toISOStringSafe(entry.updatedAt) : null,
  });
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const parsed = await parseJsonWithSchema(req, diaryUpsertSchema);
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, "invalid body");
  }

  const { date } = parsed.data;
  const contentMd = parsed.data.contentMd;

  // 내용이 비면 해당 날짜 일기를 삭제해 빈 행을 남기지 않는다.
  if (!contentMd.trim()) {
    await prisma.diaryEntry.deleteMany({ where: { userId, date } });
    return NextResponse.json({ date, contentMd: "", updatedAt: null });
  }

  const entry = await prisma.diaryEntry.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, contentMd },
    update: { contentMd },
    select: { contentMd: true, updatedAt: true },
  });

  return NextResponse.json({
    date,
    contentMd: entry.contentMd,
    updatedAt: toISOStringSafe(entry.updatedAt),
  });
}
