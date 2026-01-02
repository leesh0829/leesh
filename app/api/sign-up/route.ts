import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || "");
    const cleanName = name ? String(name).trim() : null;

    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json({ message: "email/password required" }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) {
      return NextResponse.json({ message: "email already exists" }, { status: 409 });
    }

    const hash = await bcrypt.hash(cleanPassword, 10);

    await prisma.user.create({
      data: { email: cleanEmail, password: hash, name: cleanName },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "server error" }, { status: 500 });
  }
}
