import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <Link href="/leesh" className="hover:underline">
                Leesh
              </Link>
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Next.js(App Router) + TypeScript + PostgreSQL(Prisma)로 만드는
              개인 사이트. 포트폴리오 / 블로그 / 게시판 / TODO / 캘린더까지 한
              번에.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
            >
              대시보드
            </Link>
            <Link
              href="/blog"
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              블로그
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            "Next.js 16",
            "React 19",
            "TypeScript",
            "Prisma",
            "PostgreSQL",
            "NextAuth",
            "Tailwind",
          ].map((t) => (
            <span
              key={t}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card
          title="블로그"
          desc="마크다운 기반 포스팅 + 로그인 댓글"
          href="/blog"
          actions={[
            { label: "목록", href: "/blog" },
            { label: "글쓰기", href: "/blog/new" },
          ]}
        />
        <Card
          title="게시판"
          desc="개인 보드(할일 정리) + TODO 아젠다와 캘린더 연동"
          href="/boards"
          actions={[{ label: "보드 보기", href: "/boards" }]}
        />
        <Card
          title="TODO"
          desc="TODO / DOING / DONE 관리"
          href="/todos"
          actions={[{ label: "TODO 가기", href: "/todos" }]}
        />
        <Card
          title="캘린더"
          desc="월 단위 일정 뷰"
          href="/calendar"
          actions={[{ label: "캘린더 가기", href: "/calendar" }]}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-black">
        <h2 className="text-base font-semibold">다음에 할 것들</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>할일1</li>
          <li>할일2</li>
          <li>할일3</li>
          <li>할일4</li>
        </ul>
      </section>
    </main>
  );
}

function Card({
  title,
  desc,
  href,
  actions,
}: {
  title: string;
  desc: string;
  href: string;
  actions: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-black">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {desc}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          열기
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
