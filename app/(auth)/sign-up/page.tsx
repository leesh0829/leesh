"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [showResend, setShowResend] = useState(false);

  const submit = async () => {
    setMsg("");
    const res = await fetch("/api/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setMsg("가입완료! 이메일 인증 메일을 보냈습니다. 메일함을 확인하세요!");
      setShowResend(true);
      return;
    }

    setMsg(data?.message ?? "failed");
  };

  const resend = async () => {
    setMsg("");
    const res = await fetch("/api/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) setMsg("인증 메일을 다시 보냈습니다. 메일함을 확인하세요!");
    else setMsg(data?.message ?? "재전송 실패");
  };

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Sign up</h1>

      <input placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <br /><br />
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <br /><br />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br /><br />

      <button onClick={submit}>Create account</button>
      {showResend && (
        <>
          <span style={{ marginLeft: 8 }} />
          <button type="button" onClick={resend}>
            인증 메일 재전송
          </button>
          <span style={{ marginLeft: 8 }} />
          <button type="button" onClick={() => router.push("/login")}>
            로그인으로
          </button>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}