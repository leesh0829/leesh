export default function GlobalLoading() {
  return (
    <main className="flex min-h-[70dvh] items-center justify-center py-6">
      <div role="status" aria-live="polite">
        <span className="sr-only">불러오는 중</span>
        <div className="loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}
