'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'leesh-theme'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    Promise.resolve().then(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved)
        applyTheme(saved)
        return
      }
      applyTheme('light')
    })
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <button
      type="button"
      className="btn btn-outline h-9 w-9 p-0"
      onClick={toggle}
      aria-label="라이트/다크 테마 전환"
      title="라이트/다크 테마 전환"
    >
      <span aria-hidden="true">
        {theme === 'dark' ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3c-.2.64-.31 1.31-.31 2a7 7 0 0 0 8.1 6.91Z" />
          </svg>
        )}
      </span>
    </button>
  )
}
