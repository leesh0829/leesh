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

type EdgeState = {
  atTop: boolean
  atBottom: boolean
  maxScroll: number
}

const SUMMON_DURATION_MS = 3600
const OVERSCROLL_TRIGGER = 8000
const MAX_REACTIVE_WIDTH_RATIO = 0.985
const MAX_REACTIVE_HEIGHT_RATIO = 0.92
const MAX_REACTIVE_AREA_RATIO = 0.78
const EDGE_EPSILON = 2

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

/**
 * Selects a random element from the provided array.
 *
 * @param items - The array to pick from
 * @returns A random element from `items`, or `undefined` if `items` is empty
 */
function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]
}

/**
 * Get the document element to use for reading or writing scroll position.
 *
 * @returns The scrolling element (`document.scrollingElement`) if present, otherwise `document.documentElement`
 */
function getWindowScrollElement() {
  return document.scrollingElement ?? document.documentElement
}

/**
 * Determine whether the window's vertical scroll is at the top or bottom and return the maximum scroll offset.
 *
 * If the document's maximum scrollable distance is less than or equal to EDGE_EPSILON, both `atTop` and `atBottom` are set to `true`.
 *
 * @returns An EdgeState with `atTop` true when the window scroll offset is less than or equal to EDGE_EPSILON, `atBottom` true when the window scroll offset is within EDGE_EPSILON of the maximum scrollable offset, and `maxScroll` as the maximum vertical scroll offset (always >= 0).
 */
function getWindowEdgeState(): EdgeState {
  const scrollElement = getWindowScrollElement()
  const maxScroll = Math.max(0, scrollElement.scrollHeight - window.innerHeight)
  const scrollTop = Math.max(0, window.scrollY || scrollElement.scrollTop || 0)

  if (maxScroll <= EDGE_EPSILON) {
    return { atTop: true, atBottom: true, maxScroll }
  }

  return {
    atTop: scrollTop <= EDGE_EPSILON,
    atBottom: scrollTop >= maxScroll - EDGE_EPSILON,
    maxScroll,
  }
}

/**
 * Determine whether an element is scrolled to its top or bottom and report its maximum vertical scroll.
 *
 * @param element - The HTMLElement whose vertical scroll state to evaluate.
 * @returns An EdgeState object: `atTop` is `true` if the element's scroll position is within EDGE_EPSILON pixels of the top, `atBottom` is `true` if within EDGE_EPSILON pixels of the bottom, and `maxScroll` is the maximum permissible `scrollTop` value (>= 0).
 */
function getElementEdgeState(element: HTMLElement): EdgeState {
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
  const scrollTop = Math.max(0, element.scrollTop)

  if (maxScroll <= EDGE_EPSILON) {
    return { atTop: true, atBottom: true, maxScroll }
  }

  return {
    atTop: scrollTop <= EDGE_EPSILON,
    atBottom: scrollTop >= maxScroll - EDGE_EPSILON,
    maxScroll,
  }
}

/**
 * Determines whether an element is vertically scrollable.
 *
 * @param element - The element to test for vertical scrollability
 * @returns `true` if the element's computed overflow allows vertical scrolling and its maximum scroll distance is greater than EDGE_EPSILON, `false` otherwise
 */
function isVerticallyScrollable(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false

  return getElementEdgeState(element).maxScroll > EDGE_EPSILON
}

/**
 * Selects the vertical scroll root: the provided element if it is vertically scrollable, otherwise the global window.
 *
 * @param scrollTarget - Candidate HTMLElement to use as the scroll root
 * @returns The `scrollTarget` when it can scroll vertically, `window` otherwise
 */
function getEffectiveScrollRoot(scrollTarget: HTMLElement | null) {
  if (scrollTarget && isVerticallyScrollable(scrollTarget)) {
    return scrollTarget
  }

  return window
}

/**
 * Normalize an EventTarget to an HTMLElement when possible.
 *
 * @param target - The event target to normalize; may be an EventTarget, Node, or `null`
 * @returns The corresponding HTMLElement if `target` is an `HTMLElement`, the `parentElement` when `target` is a `Node`, or `null` if no element can be resolved
 */
function getEventElement(target: EventTarget | null) {
  if (target instanceof HTMLElement) return target
  if (target instanceof Node) return target.parentElement
  return null
}

/**
 * Determine whether any ancestor between an event target and a root boundary can still scroll in the given vertical direction.
 *
 * @param target - The originating EventTarget (e.g., event.target); may be null.
 * @param direction - 'top' to check for available upward scroll, 'bottom' to check for available downward scroll.
 * @param rootBoundary - The element at which to stop searching (exclusive).
 * @returns `true` if a nested vertically-scrollable ancestor exists that can scroll further in the specified direction, `false` otherwise.
 */
function hasNestedScrollInDirection(
  target: EventTarget | null,
  direction: SummonEdge,
  rootBoundary: HTMLElement
) {
  let element = getEventElement(target)

  while (element && element !== rootBoundary) {
    if (isVerticallyScrollable(element)) {
      const { maxScroll } = getElementEdgeState(element)
      const scrollTop = Math.max(0, element.scrollTop)

      if (direction === 'top' && scrollTop > EDGE_EPSILON) return true
      if (direction === 'bottom' && scrollTop < maxScroll - EDGE_EPSILON) {
        return true
      }
    }

    element = element.parentElement
  }

  return false
}

/**
 * Copies the current state of form controls from a source element into a cloned element.
 *
 * For corresponding input, textarea, and select controls matched by document order, this updates:
 * - input: `value`, `checked`, `checked` attribute and `value` attribute;
 * - textarea: `value` and `textContent`;
 * - select: `value` and each option's `selected` state.
 *
 * @param sourceRoot - Root element containing the live form controls to read state from
 * @param cloneRoot - Root element (typically a cloned subtree) to receive the copied state
 */
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

/**
 * Displays a temporary "summon" overlay that clones and animates prominent page elements when the user overscrolls the top or bottom edge.
 *
 * When active, the component listens for scroll, wheel, and touch input to detect directional overscroll beyond a threshold, hides the original elements involved, adds edge-specific classes to the document root, and renders cloned elements with animated transforms and a themed backdrop. The summon automatically resets after a fixed duration and also resets on navigation or unmount. Event listeners and any DOM modifications are cleaned up when the effect ends.
 *
 * @returns The overlay DOM tree containing the backdrop and animated clones while a summon is active, or `null` when inactive.
 */
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

    const getRootBoundary = () => {
      const scrollRoot = getEffectiveScrollRoot(scrollTarget)
      return scrollRoot instanceof HTMLElement
        ? scrollRoot
        : (getWindowScrollElement() as HTMLElement)
    }

    const getEdgeState = () => {
      const scrollRoot = getEffectiveScrollRoot(scrollTarget)
      return scrollRoot instanceof HTMLElement
        ? getElementEdgeState(scrollRoot)
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
      const direction =
        wheelEvent.deltaY > 0
          ? 'bottom'
          : wheelEvent.deltaY < 0
            ? 'top'
            : null
      if (!direction) {
        resetOverscroll()
        return
      }

      if (
        hasNestedScrollInDirection(
          wheelEvent.target,
          direction,
          getRootBoundary()
        )
      ) {
        resetOverscroll()
        return
      }

      const edgeState = getEdgeState()

      if (direction === 'bottom' && edgeState.atBottom) {
        accumulateOverscroll('bottom', Math.abs(wheelEvent.deltaY))
        return
      }

      if (direction === 'top' && edgeState.atTop) {
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
      const direction = delta > 0 ? 'bottom' : delta < 0 ? 'top' : null

      if (!direction) {
        resetOverscroll()
        return
      }

      if (
        hasNestedScrollInDirection(
          touchEvent.target,
          direction,
          getRootBoundary()
        )
      ) {
        resetOverscroll()
        return
      }

      const edgeState = getEdgeState()

      if (direction === 'bottom' && edgeState.atBottom) {
        accumulateOverscroll('bottom', Math.abs(delta))
        return
      }

      if (direction === 'top' && edgeState.atTop) {
        accumulateOverscroll('top', Math.abs(delta))
        return
      }

      resetOverscroll()
    }

    const onTouchEnd: EventListener = () => {
      touchYRef.current = null
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    if (scrollTarget) {
      scrollTarget.addEventListener('scroll', onScroll, { passive: true })
    }

    return () => {
      window.removeEventListener('scroll', onScroll as EventListener)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)

      if (scrollTarget) {
        scrollTarget.removeEventListener('scroll', onScroll as EventListener)
      }
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
