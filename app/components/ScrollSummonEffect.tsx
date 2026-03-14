'use client'

import { usePathname } from 'next/navigation'
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

type SummonEdge = 'top' | 'bottom'

type SummonPreset = {
  accent: string
  accentSoft: string
}

type CloneSpec = {
  id: string
  html: string
  left: number
  top: number
  width: number
  height: number
  tx: number
  ty: number
  rotate: number
  delay: number
  scale: number
  zIndex: number
}

const SUMMON_DURATION_MS = 3600
const OVERSCROLL_TRIGGER = 8000
const MAX_REACTIVE_WIDTH_RATIO = 0.985
const MAX_REACTIVE_HEIGHT_RATIO = 0.92
const MAX_REACTIVE_AREA_RATIO = 0.78

const CARD_SELECTOR = [
  '[data-scroll-physics-include="true"]',
  '.surface',
  '.card',
  '.daily-quest-card',
  '.daily-luck-card',
  'section[class*="rounded-"][class*="border"]',
  'article[class*="rounded-"][class*="border"]',
  'aside[class*="rounded-"][class*="border"]',
  'div[class*="rounded-"][class*="border"]',
  'div[class*="rounded-"][class*="shadow"]',
].join(', ')

const INTERACTIVE_SELECTOR = [
  '.btn',
  '.badge',
  '.nav-link',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
].join(', ')

const STANDALONE_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'span',
  'li',
  'a',
  'button',
  'label',
].join(', ')

const ELEMENT_BLOCKLIST_SELECTOR = [
  '.app-physics-layer',
  '.app-scroll-container',
  '.world-boss-button',
  '.world-boss-overlay',
  '.scroll-physics-overlay',
  '.scroll-summon-overlay',
  'main',
  'footer',
  'body',
  'html',
].join(', ')

const ANCESTOR_BLOCKLIST_SELECTOR = [
  '[data-scroll-physics-ignore="true"]',
].join(', ')

const PRESETS: SummonPreset[] = [
  { accent: '#7c6dff', accentSoft: '#5bc2ff' },
  { accent: '#57d68d', accentSoft: '#7c6dff' },
  { accent: '#ff7f63', accentSoft: '#f3c95b' },
]

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]
}

function getWindowEdgeState() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  if (maxScroll <= 0) return { atTop: true, atBottom: true }

  return {
    atTop: window.scrollY <= 0,
    atBottom: window.scrollY >= maxScroll - 1,
  }
}

function getElementEdgeState(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight
  if (maxScroll <= 0) return { atTop: true, atBottom: true }

  return {
    atTop: element.scrollTop <= 0,
    atBottom: element.scrollTop >= maxScroll - 1,
  }
}

function syncFormState(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const sourceFields = sourceRoot.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('input, textarea, select')
  const cloneFields = cloneRoot.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('input, textarea, select')

  sourceFields.forEach((field, index) => {
    const cloneField = cloneFields[index]
    if (!cloneField) return

    if (
      field instanceof HTMLInputElement &&
      cloneField instanceof HTMLInputElement
    ) {
      cloneField.value = field.value
      cloneField.checked = field.checked
      if (field.checked) cloneField.setAttribute('checked', 'checked')
      else cloneField.removeAttribute('checked')
      cloneField.setAttribute('value', field.value)
      return
    }

    if (
      field instanceof HTMLTextAreaElement &&
      cloneField instanceof HTMLTextAreaElement
    ) {
      cloneField.value = field.value
      cloneField.textContent = field.value
      return
    }

    if (
      field instanceof HTMLSelectElement &&
      cloneField instanceof HTMLSelectElement
    ) {
      cloneField.value = field.value
      Array.from(cloneField.options).forEach((option) => {
        option.selected = option.value === field.value
      })
    }
  })
}

function serializeElement(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement
  syncFormState(element, clone)
  return clone.outerHTML
}

function isEligibleReactiveElement(
  element: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
  viewportArea: number
) {
  if (!element.isConnected) return false
  if (element.matches(ELEMENT_BLOCKLIST_SELECTOR)) return false
  if (element.closest(ANCESTOR_BLOCKLIST_SELECTOR)) return false

  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  const area = rect.width * rect.height

  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (Number.parseFloat(style.opacity || '1') < 0.08) return false
  if (rect.width < 10 || rect.height < 10) return false
  if (rect.bottom < -24 || rect.top > viewportHeight + 24) return false
  if (rect.right < -24 || rect.left > viewportWidth + 24) return false
  if (rect.width > viewportWidth * MAX_REACTIVE_WIDTH_RATIO) return false
  if (rect.height > viewportHeight * MAX_REACTIVE_HEIGHT_RATIO) return false
  if (area > viewportArea * MAX_REACTIVE_AREA_RATIO) return false

  return true
}

function isStandaloneRenderableElement(element: HTMLElement) {
  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return false

  const tagName = element.tagName.toLowerCase()
  const hasElementChildren = element.children.length > 0

  if (tagName === 'div' || tagName === 'span') {
    if (hasElementChildren) return false

    const hasDirectTextNode = Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    )

    return hasDirectTextNode
  }

  if (tagName === 'p' || tagName === 'label' || tagName === 'li') return true
  if (tagName === 'a' || tagName === 'button') return true
  if (/^h[1-6]$/.test(tagName)) return true

  return !hasElementChildren
}

function collectReactiveElements(container: HTMLElement) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const viewportArea = viewportWidth * viewportHeight

  const cardCandidates = Array.from(
    container.querySelectorAll<HTMLElement>(CARD_SELECTOR)
  )

  const cards = cardCandidates.filter((element) =>
    isEligibleReactiveElement(
      element,
      viewportWidth,
      viewportHeight,
      viewportArea
    )
  )

  const selectedCardSet = new Set(cards)
  const isInsideSelectedCard = (element: HTMLElement) =>
    cards.some(
      (card) =>
        card !== element && selectedCardSet.has(card) && card.contains(element)
    )

  const interactives = Array.from(
    container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)
  ).filter((element) => !isInsideSelectedCard(element))

  const standalone = Array.from(
    container.querySelectorAll<HTMLElement>(STANDALONE_SELECTOR)
  )
    .filter((element) => isStandaloneRenderableElement(element))
    .filter((element) => !isInsideSelectedCard(element))
    .filter(
      (element) =>
        !element.closest(INTERACTIVE_SELECTOR) ||
        !isEligibleReactiveElement(
          element.closest(INTERACTIVE_SELECTOR) as HTMLElement,
          viewportWidth,
          viewportHeight,
          viewportArea
        )
    )

  const merged = [...cards, ...interactives, ...standalone]

  return merged
    .filter((element, index, list) => {
      if (list.indexOf(element) !== index) return false
      return isEligibleReactiveElement(
        element,
        viewportWidth,
        viewportHeight,
        viewportArea
      )
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect()
      const rectB = b.getBoundingClientRect()
      if (rectA.top !== rectB.top) return rectA.top - rectB.top
      return rectA.left - rectB.left
    })
}

function buildCloneSpecs(elements: HTMLElement[], edge: SummonEdge) {
  const viewportHeight = window.innerHeight

  return elements.map((element, index) => {
    const rect = element.getBoundingClientRect()
    const bottomDistance = Math.max(0, viewportHeight - rect.bottom)
    const topDistance = Math.max(0, rect.top)

    const targetTop =
      edge === 'top'
        ? 18 + (index % 4) * 5
        : viewportHeight - rect.height - 12 - (index % 3) * 2

    const tx =
      edge === 'top' ? ((index % 6) - 2.5) * 3.5 : ((index % 7) - 3) * 2.5

    const ty = targetTop - rect.top
    const delay =
      edge === 'top'
        ? Math.min(520, Math.round(bottomDistance * 0.38))
        : Math.min(220, Math.round(topDistance * 0.05))

    return {
      id: `${edge}-${index}-${Math.round(rect.left)}-${Math.round(rect.top)}`,
      html: serializeElement(element),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      tx,
      ty,
      rotate:
        edge === 'top' ? ((index % 5) - 2) * 1.8 : ((index % 7) - 3) * 4.6,
      delay,
      scale: edge === 'top' ? 1.015 : 0.985,
      zIndex: 1000 + index,
    }
  })
}

export default function ScrollSummonEffect() {
  const pathname = usePathname()

  const [active, setActive] = useState(false)
  const [edge, setEdge] = useState<SummonEdge>('top')
  const [preset, setPreset] = useState<SummonPreset | null>(null)
  const [clones, setClones] = useState<CloneSpec[]>([])

  const resetTimerRef = useRef<number | null>(null)
  const triggeredRef = useRef(false)
  const overscrollAmountRef = useRef(0)
  const overscrollEdgeRef = useRef<SummonEdge | null>(null)
  const touchYRef = useRef<number | null>(null)
  const hiddenElementsRef = useRef<HTMLElement[]>([])

  const restoreOriginals = useEffectEvent(() => {
    hiddenElementsRef.current.forEach((element) => {
      element.classList.remove('scroll-physics-original-hidden')
    })
    hiddenElementsRef.current = []
  })

  const resetSummon = useEffectEvent(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }

    restoreOriginals()
    triggeredRef.current = false
    overscrollAmountRef.current = 0
    overscrollEdgeRef.current = null
    touchYRef.current = null

    setActive(false)
    setPreset(null)
    setClones([])
  })

  useEffect(() => {
    const resetFrame = window.requestAnimationFrame(() => {
      resetSummon()
    })

    return () => window.cancelAnimationFrame(resetFrame)
  }, [pathname])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove(
      'scroll-summon-top-active',
      'scroll-summon-bottom-active'
    )

    if (active) {
      root.classList.add(
        edge === 'top'
          ? 'scroll-summon-top-active'
          : 'scroll-summon-bottom-active'
      )
    }

    return () => {
      root.classList.remove(
        'scroll-summon-top-active',
        'scroll-summon-bottom-active'
      )
    }
  }, [active, edge])

  useEffect(() => {
    const scrollTarget = document.querySelector(
      '.app-scroll-container'
    ) as HTMLElement | null

    const getEdgeState = () => {
      return scrollTarget
        ? getElementEdgeState(scrollTarget)
        : getWindowEdgeState()
    }

    const resetOverscroll = () => {
      overscrollAmountRef.current = 0
      overscrollEdgeRef.current = null
    }

    const triggerSummon = (direction: SummonEdge) => {
      if (triggeredRef.current || active) return

      const container = document.querySelector(
        '.app-physics-layer'
      ) as HTMLElement | null
      if (!container) return

      const elements = collectReactiveElements(container)
      if (elements.length === 0) return

      const nextPreset = randomItem(PRESETS)
      const nextClones = buildCloneSpecs(elements, direction)

      hiddenElementsRef.current = elements
      elements.forEach((element) => {
        element.classList.add('scroll-physics-original-hidden')
      })

      triggeredRef.current = true
      setEdge(direction)
      setPreset(nextPreset)
      setClones(nextClones)
      setActive(true)

      resetTimerRef.current = window.setTimeout(() => {
        resetSummon()
      }, SUMMON_DURATION_MS)
    }

    const accumulateOverscroll = (direction: SummonEdge, amount: number) => {
      if (triggeredRef.current || active) return

      if (overscrollEdgeRef.current !== direction) {
        overscrollEdgeRef.current = direction
        overscrollAmountRef.current = 0
      }

      overscrollAmountRef.current += amount

      if (overscrollAmountRef.current >= OVERSCROLL_TRIGGER) {
        triggerSummon(direction)
        resetOverscroll()
      }
    }

    const onScroll = () => {
      if (triggeredRef.current || active) return
      const edgeState = getEdgeState()
      if (!edgeState.atTop && !edgeState.atBottom) resetOverscroll()
    }

    const onWheel: EventListener = (event) => {
      if (triggeredRef.current || active) return

      const wheelEvent = event as WheelEvent
      const edgeState = getEdgeState()

      if (edgeState.atBottom && wheelEvent.deltaY > 0) {
        accumulateOverscroll('bottom', Math.abs(wheelEvent.deltaY))
        return
      }

      if (edgeState.atTop && wheelEvent.deltaY < 0) {
        accumulateOverscroll('top', Math.abs(wheelEvent.deltaY))
        return
      }

      resetOverscroll()
    }

    const onTouchStart: EventListener = (event) => {
      const touchEvent = event as TouchEvent
      touchYRef.current = touchEvent.touches[0]?.clientY ?? null
    }

    const onTouchMove: EventListener = (event) => {
      if (triggeredRef.current || active) return

      const touchEvent = event as TouchEvent
      const currentY = touchEvent.touches[0]?.clientY
      const prevY = touchYRef.current
      if (typeof currentY !== 'number' || typeof prevY !== 'number') return

      const delta = prevY - currentY
      touchYRef.current = currentY

      const edgeState = getEdgeState()

      if (edgeState.atBottom && delta > 0) {
        accumulateOverscroll('bottom', Math.abs(delta))
        return
      }

      if (edgeState.atTop && delta < 0) {
        accumulateOverscroll('top', Math.abs(delta))
        return
      }

      resetOverscroll()
    }

    const onTouchEnd: EventListener = () => {
      touchYRef.current = null
    }

    const target: HTMLElement | Window = scrollTarget ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    target.addEventListener('wheel', onWheel, { passive: true })
    target.addEventListener('touchstart', onTouchStart, { passive: true })
    target.addEventListener('touchmove', onTouchMove, { passive: true })
    target.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      target.removeEventListener('scroll', onScroll as EventListener)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('touchstart', onTouchStart)
      target.removeEventListener('touchmove', onTouchMove)
      target.removeEventListener('touchend', onTouchEnd)
    }
  }, [active, pathname])

  useEffect(() => {
    return () => {
      resetSummon()
    }
  }, [])

  if (!active || !preset || clones.length === 0) return null

  return (
    <div
      className={'scroll-physics-overlay ' + `scroll-physics-overlay-${edge}`}
      aria-hidden="true"
    >
      <div
        className="scroll-physics-backdrop"
        style={
          {
            ['--summon-accent' as const]: preset.accent,
            ['--summon-accent-soft' as const]: preset.accentSoft,
          } as CSSProperties
        }
      />

      {clones.map((clone) => (
        <div
          key={clone.id}
          className={'scroll-physics-clone ' + `scroll-physics-clone-${edge}`}
          style={
            {
              left: `${clone.left}px`,
              top: `${clone.top}px`,
              width: `${clone.width}px`,
              height: `${clone.height}px`,
              zIndex: clone.zIndex,
              ['--clone-tx' as const]: `${clone.tx}px`,
              ['--clone-ty' as const]: `${clone.ty}px`,
              ['--clone-rot' as const]: `${clone.rotate}deg`,
              ['--clone-delay' as const]: `${clone.delay}ms`,
              ['--clone-scale' as const]: `${clone.scale}`,
            } as CSSProperties
          }
        >
          <div
            className="scroll-physics-clone-inner"
            dangerouslySetInnerHTML={{ __html: clone.html }}
          />
        </div>
      ))}
    </div>
  )
}
