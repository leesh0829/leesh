import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { message: "multipart/form-data만 지원합니다." },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file이 없습니다." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { message: "이미지 파일만 업로드 가능합니다." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: "파일이 너무 큽니다. (최대 5MB)" },
      { status: 400 },
    );
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const extFromName = path.extname(file.name || "").toLowerCase();
  const safeExt = extFromName && extFromName.length <= 8 ? extFromName : "";
  const filename = `${randomUUID()}${safeExt}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filepath, buf);

  // public 기준 URL
  const url = `/uploads/${filename}`;
  return NextResponse.json({ url });
}
