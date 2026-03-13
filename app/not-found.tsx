import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="container-page py-8">
      <section className="not-found-shell">
        <div className="not-found-copy">
          <div className="not-found-kicker">404</div>
          <h1 className="not-found-title">존재하지 않는 길입니다</h1>
          <p className="not-found-desc">
            길을 잘못 든 사이, 404 생물이 먼저 자리를 차지했습니다. 잠깐
            구경하고 원래 경로로 돌아가면 됩니다.
          </p>

          <div className="not-found-actions">
            <Link href="/" className="btn btn-primary">
              홈으로
            </Link>
            <Link href="/dashboard" className="btn btn-outline">
              대시보드
            </Link>
          </div>

          <div className="not-found-note">
            <span className="badge">404 생물 출현</span>
            <span className="text-sm opacity-70">
              없는 페이지에서만 보입니다.
            </span>
          </div>
        </div>

        <div
          className="not-found-creature surface"
          data-scroll-physics-ignore="true"
          aria-hidden="true"
        >
          <div className="not-found-creature-stage">
            <div className="not-found-portal" />
            <div className="not-found-ripple not-found-ripple-a" />
            <div className="not-found-ripple not-found-ripple-b" />
            <div className="not-found-ripple not-found-ripple-c" />

            <div className="not-found-orbit not-found-orbit-a" />
            <div className="not-found-orbit not-found-orbit-b" />
            <div className="not-found-orbit not-found-orbit-c" />

            <div className="not-found-body">
              <div className="not-found-horn not-found-horn-left" />
              <div className="not-found-horn not-found-horn-right" />
              <div className="not-found-face">
                <span className="not-found-eye not-found-eye-left" />
                <span className="not-found-eye not-found-eye-right" />
                <span className="not-found-mouth" />
              </div>
            </div>

            <div className="not-found-shadow" />
          </div>
        </div>
      </section>
    </main>
  )
}
