'use client'

import { useEffect, useRef } from 'react'

type ScrambleTarget = {
  node: Text
  original: string
  startAt: number
  duration: number
}

const TRIGGER_SEQUENCE = 'hack'
const SEQUENCE_WINDOW_MS = 2400
const CHAR_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*?/'

const TARGET_SELECTOR = [
  'h1',
  'h2',
  'h3',
  '.not-found-title',
  '[class*="text-2xl"][class*="font-bold"]',
  '[class*="text-2xl"][class*="font-semibold"]',
  '[class*="text-lg"][class*="font-semibold"]',
  '[class*="text-base"][class*="font-semibold"]',
  '[class*="text-base"][class*="font-extrabold"]',
  '[class*="text-sm"][class*="font-extrabold"]',
].join(', ')

function randomChar() {
  return CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)] ?? '#'
}

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

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (Number.parseFloat(style.opacity || '1') < 0.08) return false
  if (rect.width < 8 || rect.height < 8) return false
  if (rect.bottom < -24 || rect.top > window.innerHeight + 24) return false
  if (rect.right < -24 || rect.left > window.innerWidth + 24) return false

  return true
}

function getSingleTextNode(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.replace(/\s+/g, ' ').trim()) {
        return NodeFilter.FILTER_SKIP
      }

      return NodeFilter.FILTER_ACCEPT
    },
  })

  const first = walker.nextNode()
  const second = walker.nextNode()
  if (!(first instanceof Text) || second) return null
  return first
}

function scrambleText(original: string, progress: number) {
  const trimmed = original.trim()
  const revealCount = Math.floor(trimmed.length * progress)

  return trimmed
    .split('')
    .map((char, index) => {
      if (char === ' ') return ' '
      if (index < revealCount) return char
      return randomChar()
    })
    .join('')
}

export default function HeadingHackEffect() {
  const sequenceRef = useRef('')
  const sequenceTimesRef = useRef<number[]>([])
  const targetsRef = useRef<ScrambleTarget[]>([])
  const frameRef = useRef<number | null>(null)
  const activeRef = useRef(false)

  useEffect(() => {
    const restoreTargets = () => {
      targetsRef.current.forEach(({ node, original }) => {
        node.textContent = original
      })
      targetsRef.current = []

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }

      activeRef.current = false
    }

    const tick = () => {
      const now = performance.now()
      let hasRunning = false

      targetsRef.current.forEach((target) => {
        const progress = Math.min(1, (now - target.startAt) / target.duration)
        target.node.textContent =
          progress >= 1
            ? target.original
            : scrambleText(target.original, progress)

        if (progress < 1) hasRunning = true
      })

      if (!hasRunning) {
        restoreTargets()
        return
      }

      frameRef.current = window.requestAnimationFrame(tick)
    }

    const triggerHack = () => {
      if (activeRef.current) return

      const seen = new Set<Text>()
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>(TARGET_SELECTOR)
      )
        .filter((element) => isVisible(element))
        .map((element) => {
          const node = getSingleTextNode(element)
          if (!node || seen.has(node)) return null

          const original = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
          if (original.length < 2 || original.length > 42) return null

          seen.add(node)
          return {
            node,
            original,
            startAt: performance.now() + Math.random() * 220,
            duration: 720 + Math.random() * 520,
          }
        })
        .filter((item): item is ScrambleTarget => !!item)

      if (targets.length === 0) return

      targetsRef.current = targets
      activeRef.current = true
      tick()
    }

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
        triggerHack()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      restoreTargets()
    }
  }, [])

  return null
}
