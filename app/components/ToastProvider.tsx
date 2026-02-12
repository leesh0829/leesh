'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

type ToastTone = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  tone: ToastTone
  message: string
  exiting: boolean
}

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function toneClass(tone: ToastTone) {
  if (tone === 'success') {
    return 'border-emerald-400/45 text-emerald-100'
  }
  if (tone === 'error') {
    return 'border-rose-400/45 text-rose-100'
  }
  return 'border-sky-400/45 text-sky-100'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextIdRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, exiting: true } : item))
    )
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }, 180)
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const trimmed = message.trim()
      if (!trimmed) return

      const id = nextIdRef.current++
      setItems((prev) => [
        ...prev,
        { id, tone, message: trimmed, exiting: false },
      ])

      window.setTimeout(() => {
        dismiss(id)
      }, 2600)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
      info: (message) => show(message, 'info'),
    }),
    [show]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-3 top-3 z-[90] grid w-[min(92vw,360px)] gap-2 sm:right-4 sm:top-4">
        {items.map((item) => (
          <div
            key={item.id}
            className={
              'surface border px-3 py-2 text-sm shadow-lg backdrop-blur-md ' +
              toneClass(item.tone) +
              ' ' +
              (item.exiting ? 'toast-exit' : 'toast-enter')
            }
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
