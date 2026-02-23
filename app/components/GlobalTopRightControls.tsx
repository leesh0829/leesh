'use client'

import ThemeToggle from './ThemeToggle'

export default function GlobalTopRightControls() {
  return (
    <div className="fixed right-3 top-3 z-50 hidden lg:flex lg:items-center lg:gap-2 sm:right-4 sm:top-4">
      <ThemeToggle />
    </div>
  )
}
