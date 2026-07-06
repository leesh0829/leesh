import type { Metadata } from 'next'
import { CHANGELOG } from '@/app/lib/changelog'

export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: '업데이트 내역 · Leesh',
  description: 'Leesh 서비스의 변경 이력',
}

export default function ChangelogPage() {
  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <h1 className="text-2xl font-bold">업데이트 내역</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          그동안의 변경 사항을 최신순으로 모았습니다.
        </p>

        <div className="mt-6 grid gap-3">
          {CHANGELOG.map((entry, index) => (
            <section
              key={entry.date}
              className="card card-pad card-hover-border-only"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{entry.date}</h2>
                {entry.title ? (
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>
                    {entry.title}
                  </span>
                ) : null}
                {index === 0 ? <span className="badge">NEW</span> : null}
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
