"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function VerifyEmailContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState("인증 처리중...");

  useEffect(() => {
    const email = sp.get("email") ?? "";
    const token = sp.get("token") ?? "";

    (async () => {
      const res = await fetch(`/api/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
      if (res.ok) {
        setMsg("이메일 인증 완료! 로그인 페이지로 이동합니다...");
        setTimeout(() => router.push("/login"), 800);
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(`인증 실패: ${d?.message ?? "unknown"}`);
      }
    })();
  }, [sp, router]);

  return (
    <p>{msg}</p>
  );
}

export default function VerifyEmailPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Verify Email</h1>
      <Suspense fallback={<p>인증 처리중...</p>}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
