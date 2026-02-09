import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  // 접근 제어는 각 페이지/API에서 서버 권한 검사로 처리.
  // middleware에서 토큰 파싱 실패로 오탐 리다이렉트가 발생하던 문제를 제거.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
