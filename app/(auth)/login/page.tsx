"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [showResend, setShowResend] = useState(false);

  const submit = async () => {
    setMsg("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/dashboard");
      return;
    }

    if (res?.error === "EMAIL_NOT_VERIFIED") {
      setMsg("이메일 인증이 필요합니다. 인증 메일을 다시 보내는 중...");
      setShowResend(true);

      const rr = await fetch("/api/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (rr.ok) {
        setMsg("이메일 인증이 필요합니다. 인증 메일을 재전송했습니다. 메일함을 확인하세요.");
      } else {
        const d = await rr.json().catch(() => ({}));
        setMsg(`이메일 인증이 필요합니다. (재전송 실패: ${d?.message ?? "unknown"})`);
      }
      return;
    }

    setMsg("로그인 실패");
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Login</h1>

      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {showResend && (
        <>
          <button
            type="button"
            onClick={async () => {
              setMsg("");
              const res = await fetch("/api/resend-verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              if (res.ok) {
                setMsg("인증 메일을 재전송했습니다. 메일함을 확인하세요!");
              } else {
                const d = await res.json().catch(() => ({}));
                setMsg(d?.message ?? "재전송 실패");
              }
            }}
          >
            인증 메일 재전송
          </button>
        </>
      )}
      <br /><br />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br /><br />
      <button onClick={submit}>Login</button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
