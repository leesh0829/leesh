'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type TocHeading = {
  id: string
  text: string
  level: number
}

export default function SectionTocClient({
  headings,
  title = '목차',
}: {
  headings: TocHeading[]
  title?: string
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? '')
  const navRef = useRef<HTMLElement | null>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  const validHeadings = useMemo(
    () => headings.filter((h) => h.id && h.text),
    [headings]
  )
  const resolvedActiveId = validHeadings.some((h) => h.id === activeId)
    ? activeId
    : validHeadings[0]?.id ?? ''

  useEffect(() => {
    if (validHeadings.length === 0) return

    const elements = validHeadings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => !!el)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        root: null,
        rootMargin: '-45% 0px -45% 0px',
        threshold: [0],
      }
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [validHeadings])

  const scrollTocItemToCenter = (id: string, smooth: boolean) => {
    const nav = navRef.current
    const button = buttonRefs.current.get(id)
    if (!nav || !button) return

    const desiredTop =
      button.offsetTop - nav.clientHeight / 2 + button.clientHeight / 2
    const maxTop = Math.max(0, nav.scrollHeight - nav.clientHeight)
    const nextTop = Math.min(maxTop, Math.max(0, desiredTop))

    nav.scrollTo({
      top: nextTop,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  useEffect(() => {
    if (!resolvedActiveId) return
    scrollTocItemToCenter(resolvedActiveId, false)
  }, [resolvedActiveId])

  if (validHeadings.length === 0) return null

  return (
    <aside className="card card-pad h-fit">
      <div className="text-sm font-extrabold">{title}</div>
      <nav
        ref={navRef}
        aria-label={title}
        className="mt-3 grid max-h-[68vh] gap-1 overflow-y-auto pr-1"
      >
        {validHeadings.map((h) => {
          const isActive = h.id === resolvedActiveId
          return (
            <button
              key={h.id}
              ref={(node) => {
                if (node) buttonRefs.current.set(h.id, node)
                else buttonRefs.current.delete(h.id)
              }}
              type="button"
              onClick={() => {
                const target = document.getElementById(h.id)
                if (!target) return
                target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setActiveId(h.id)
                scrollTocItemToCenter(h.id, true)
              }}
              className={
                'text-left rounded-md px-2 py-1.5 text-xs leading-5 transition ' +
                (isActive
                  ? 'bg-[color:var(--ring)] text-[color:var(--foreground)] font-semibold'
                  : 'opacity-80 hover:opacity-100 hover:bg-[color:var(--ring)]')
              }
              style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
              title={h.text}
            >
              <span className="block whitespace-normal break-words">
                {h.text}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
