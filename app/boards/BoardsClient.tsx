"use client";

import { useState } from "react";
import Link from "next/link";

type Board = {
  id: string;
  name: string;
  description: string | null;
};

export default function BoardsClient({
  initialBoards,
}: {
  initialBoards: Board[];
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const reload = async () => {
    const res = await fetch("/api/boards");
    if (res.ok) setBoards(await res.json());
  };

  const create = async () => {
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (res.ok) {
      setName("");
      setDescription("");
      await reload();
    }
  };

  return (
    <main>
      <h1>Boards</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="보드 이름"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="설명"
      />
      <button onClick={create}>생성</button>

      <ul>
        {boards.map((b) => (
          <li key={b.id}>
            <Link href={`/boards/${b.id}`}>{b.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
