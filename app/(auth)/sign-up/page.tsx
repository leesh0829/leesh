"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const res = await fetch("/api/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (res.ok) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setMsg(data?.message ?? "failed");
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

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
