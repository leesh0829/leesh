import Link from 'next/link'

type NavLink = { href: string; title: string }
type RelatedLink = { href: string; title: string; meta?: string }

export default function PostReadingFooter({
  prev,
  next,
  related,
}: {
  prev: NavLink | null
  next: NavLink | null
  related: RelatedLink[]
}) {
  if (!prev && !next && related.length === 0) return null

  return (
    <div className="mt-6 grid gap-4">
      {prev || next ? (
        <nav className="grid gap-2 sm:grid-cols-2" aria-label="이전/다음 글">
          {prev ? (
            <Link
              href={prev.href}
              className="card card-pad block no-underline hover:no-underline"
            >
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                ← 이전 글
              </div>
              <div className="mt-1 truncate font-semibold">{prev.title}</div>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
          {next ? (
            <Link
              href={next.href}
              className="card card-pad block text-right no-underline hover:no-underline"
            >
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                다음 글 →
              </div>
              <div className="mt-1 truncate font-semibold">{next.title}</div>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
        </nav>
      ) : null}

      {related.length > 0 ? (
        <section aria-label="관련 글">
          <div className="mb-2 text-sm font-semibold">관련 글</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="card card-pad block no-underline hover:no-underline"
              >
                <div className="truncate font-semibold">{r.title}</div>
                {r.meta ? (
                  <div
                    className="mt-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {r.meta}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
