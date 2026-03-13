'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'

type TextMutation = {
  node: Text
  original: string
}

const CLICK_THRESHOLD = 5
const CLICK_WINDOW_MS = 4200
const ACTIVE_MS = 6800
const MAX_MUTATIONS = 20

const TRIGGER_SELECTOR = '[data-inversion-trigger="true"]'

const TARGET_SELECTOR = [
  '.nav-link',
  '.btn',
  '.badge',
  'h1',
  'h2',
  'h3',
  '[class*="text-xs"][class*="opacity-60"]',
  '[class*="text-sm"][class*="font-semibold"]',
  'a[class*="text-sm"]',
].join(', ')

const SHORT_PHRASES = [
  '왜 이래요',
  '잠깐만요',
  '수상함',
  '이상 감지',
  '버튼 멍함',
  '메뉴 탈주',
  '오늘 쉼',
  '진짜요?',
  '자고 싶다',
  '점메추',
  '하하하하',
  '히히히히히',
  'ㅋㅋㅋㅋㅋㅋㅋ',
  '후헤후헤후헤헤',
  '어쩌라고',
  '이게 맞나',
  '저메뉴',
  '배고프다',
  '눈아파',
  '아델리펭귄',
  '핸드폰',
  '종이',
  '사람',
  '충전기',
  '노트북',
  '맥북',
  '이어폰',
  '초코바',
]

const LONG_PHRASES = [
  '이 문장은 잠깐 길을 잃었습니다',
  '지금은 정상처럼 보이기 모드가 꺼졌습니다',
  '운영진도 이 문구를 예상하지 못했습니다',
  '버튼이 스스로 다른 인생을 선택했습니다',
  '잠깐만요 이 UI가 갑자기 자아를 가졌습니다',
  '오늘의 화면 상태는 살짝 엉뚱함입니다',
  '지금 보고 있는 문장은 임시 반전 중입니다',
  '여긴 원래 이렇지 않았던 것 같습니다',
  '아 집가고 싶다',
  '일주일이 이렇게 길었나',
  '대학교가기 싫다',
  '아무것도 하기가 싫다',
  '이건 환각입니다',
  '일하기 싫어서 이거 만드는겁니다',
  '저는 당신이 좋습니다',
  '저는 당신의 이메일을 알고있습니다',
  '빨리 일해 이 노예야',
  '솔직히 이거 구림',
  '다른 이스터에그도 많으니 찾아보기',
  '하 일하기가 싫다',
  '파리생제르맹 우승 가자',
  '랜더스 우승 가자',
  '게임 할게 없네 요즘',
  '운동해야하는데',
  '노트북 죽을려하네',
]

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]
}

function shuffle<T>(items: T[]) {
  const next = [...items]

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }

  return next
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

function getSingleRenderableTextNode(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.replace(/\s+/g, ' ').trim()) {
        return NodeFilter.FILTER_SKIP
      }

      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_SKIP
      if (parent.closest('[data-inversion-ignore="true"]')) {
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

function getReplacement(original: string) {
  const compact = original.replace(/\s+/g, ' ').trim()
  if (compact.length <= 8) return randomItem(SHORT_PHRASES) ?? compact
  return randomItem(LONG_PHRASES) ?? compact
}

export default function InversionMode() {
  const [active, setActive] = useState(false)
  const mutationsRef = useRef<TextMutation[]>([])
  const clickTimesRef = useRef<number[]>([])
  const resetTimerRef = useRef<number | null>(null)

  const restoreTexts = useEffectEvent(() => {
    mutationsRef.current.forEach(({ node, original }) => {
      node.textContent = original
    })
    mutationsRef.current = []

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }

    document.documentElement.classList.remove('ui-inversion-active')
    setActive(false)
  })

  const activate = useEffectEvent(() => {
    if (active) return

    const candidates = shuffle(
      Array.from(document.querySelectorAll<HTMLElement>(TARGET_SELECTOR))
    )
      .filter((element) => !element.matches(TRIGGER_SELECTOR))
      .filter((element) => !element.closest('[data-inversion-ignore="true"]'))
      .filter((element) => isVisible(element))
      .map((element) => {
        const textNode = getSingleRenderableTextNode(element)
        if (!textNode) return null

        const original = textNode.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        if (!original || original.length > 34) return null

        return { node: textNode, original }
      })
      .filter((item, index, list): item is TextMutation => {
        if (!item) return false
        return (
          list.findIndex((candidate) => candidate?.node === item.node) === index
        )
      })
      .slice(0, MAX_MUTATIONS)

    if (candidates.length === 0) return

    mutationsRef.current = candidates
    candidates.forEach(({ node, original }) => {
      node.textContent = getReplacement(original)
    })

    document.documentElement.classList.add('ui-inversion-active')
    setActive(true)

    resetTimerRef.current = window.setTimeout(() => {
      restoreTexts()
    }, ACTIVE_MS)
  })

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const trigger = target.closest(TRIGGER_SELECTOR)
      if (!trigger) return

      const now = Date.now()
      clickTimesRef.current = [...clickTimesRef.current, now].filter(
        (time) => now - time <= CLICK_WINDOW_MS
      )

      if (clickTimesRef.current.length >= CLICK_THRESHOLD) {
        clickTimesRef.current = []
        activate()
      }
    }

    document.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('click', onClick)
      restoreTexts()
    }
  }, [])

  return null
}
