import Link from 'next/link'

/**
 * Renders the application's homepage with a header, category chips, a grid of feature cards, and an upcoming tasks list.
 *
 * @returns A JSX element representing the homepage layout, including the Leesh link and description, a dashboard button, rounded category chips, five feature cards (Blog, Boards, TODO, Calendar, Mini Game), and a short "next tasks" list.
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl">
      <section className="surface card-pad">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <Link href="/leesh" className="hover:underline">
                Leesh
              </Link>
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              포트폴리오 / 블로그 / 게시판 / TODO / 캘린더까지 일정 관리를 한
              번에.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="btn btn-primary rounded-md px-4 py-2 text-sm font-medium text-nowrap"
            >
              대시보드
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {['블로그', '게시판', 'TODO', '캘린더', '미니 게임'].map((t) => (
            <span
              key={t}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="stagger-in mt-6 grid gap-4 sm:grid-cols-2">
        <Card
          title="블로그"
          desc="마크다운 기반 포스팅 + 로그인 댓글"
          href="/blog"
          actions={[{ label: '목록', href: '/blog' }]}
        />
        <Card
          title="게시판"
          desc="개인 보드(할일 정리) + TODO 아젠다와 캘린더 연동"
          href="/boards"
          actions={[{ label: '보드 보기', href: '/boards' }]}
        />
        <Card
          title="TODO"
          desc="TODO / DOING / DONE 할 일 관리"
          href="/todos"
          actions={[{ label: 'TODO 가기', href: '/todos' }]}
        />
        <Card
          title="캘린더"
          desc="월 단위 일정 뷰"
          href="/calendar"
          actions={[{ label: '캘린더 가기', href: '/calendar' }]}
        />
        <Card
          title="미니 게임"
          desc="홈과 사이드바에서 바로 여는 반응속도 테스트"
          href="/minigame"
          actions={[{ label: '플레이', href: '/minigame' }]}
        />
      </section>

      <section className="surface card-pad mt-6">
        <h2 className="text-base font-semibold">다음에 할 것들</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>할일1</li>
          <li>할일2</li>
          <li>할일3</li>
          <li>할일4</li>
        </ul>
      </section>
    </main>
  )
}

function Card({
  title,
  desc,
  href,
  actions,
}: {
  title: string
  desc: string
  href: string
  actions: Array<{ label: string; href: string }>
}) {
  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {desc}
          </p>
        </div>
        <Link
          href={href}
          className="btn btn-outline shrink-0 px-3 py-1.5 text-sm"
        >
          열기
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="btn btn-primary rounded-md px-3 py-2 text-sm font-medium"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
