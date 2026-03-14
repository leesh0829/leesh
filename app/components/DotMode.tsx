'use client'

import { useEffect, useRef } from 'react'

const TRIGGER_SEQUENCE = 'dot'
const SEQUENCE_WINDOW_MS = 2200

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true
  }

  if (target.isContentEditable) return true
  return !!target.closest('input, textarea, select, [contenteditable="true"]')
}

export default function DotMode() {
  const sequenceRef = useRef('')
  const sequenceTimesRef = useRef<number[]>([])

  useEffect(() => {
    const root = document.documentElement

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const key = event.key.toLowerCase()
      if (!/^[a-z]$/.test(key)) {
        sequenceRef.current = ''
        sequenceTimesRef.current = []
        return
      }

      const now = Date.now()
      sequenceTimesRef.current = [...sequenceTimesRef.current, now].filter(
        (time) => now - time <= SEQUENCE_WINDOW_MS
      )
      sequenceRef.current = (sequenceRef.current + key).slice(
        -TRIGGER_SEQUENCE.length
      )

      if (
        sequenceRef.current === TRIGGER_SEQUENCE &&
        sequenceTimesRef.current.length >= TRIGGER_SEQUENCE.length
      ) {
        sequenceRef.current = ''
        sequenceTimesRef.current = []
        root.classList.toggle('dot-mode-active')
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      root.classList.remove('dot-mode-active')
    }
  }, [])

  return null
}
