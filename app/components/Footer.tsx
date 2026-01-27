export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[color:var(--border)]">
      <div
        className="container-page py-4 text-xs"
        style={{ color: 'var(--muted)' }}
      >
        <div className="surface px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div></div>
            <div>© 2026 Leesh. All rights reserved.</div>
            <div></div>
          </div>
        </div>
      </div>
    </footer>
  )
}
