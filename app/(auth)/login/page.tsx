"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setMsg("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/boards");
    } else {
      setMsg("login failed");
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Login</h1>

      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <br /><br />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br /><br />
      <button onClick={submit}>Login</button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
