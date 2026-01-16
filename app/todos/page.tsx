import TodosClient from "./TodosClient";
export const runtime = "nodejs";

export default function TodosPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>TODO</h1>
      <TodosClient />
    </main>
  );
}