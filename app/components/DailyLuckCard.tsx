'use client'

import { useEffect, useMemo, useState } from 'react'

type LuckyColor = {
  name: string
  value: string
}

type LuckyBundle = {
  day: string
  number: number
  color: LuckyColor
  symbol: string
  aura: string
  tip: string
}

const LUCKY_COLORS: LuckyColor[] = [
  { name: 'Aurora Mint', value: '#57d68d' },
  { name: 'Sky Pulse', value: '#2fc8ff' },
  { name: 'Sunset Coral', value: '#ff8f6b' },
  { name: 'Electric Iris', value: '#7c6dff' },
  { name: 'Gold Dust', value: '#f3c95b' },
  { name: 'Rose Signal', value: '#ff6fae' },
  { name: 'Polar Lime', value: '#b9ff66' },
  { name: 'Deep Ocean', value: '#4f8cff' },
]

const LUCKY_SYMBOLS = [
  '✦',
  '☘',
  '☀',
  '☾',
  '⚑',
  '⚡',
  '◆',
  '∞',
  '✧',
  '★',
  '☆',
  '☁',
  '☂',
  '☕',
  '♣',
  '♠',
  '♥',
  '♦',
  '♬',
  '♻',
  '⚙',
  '✈',
  '✉',
  '✔',
  '➤',
  '➜',
  '➔',
  '⬆',
  '⬇',
  '⬅',
  '➡',
  '⟡',
  '⟢',
  '⟣',
  '⟤',
  '○',
  '●',
  '◎',
  '◇',
  '◈',
  '◉',
  '◌',
  '◍',
  '◐',
  '◑',
] as const

const LUCKY_AURAS = [
  '오늘은 이상하게 작은 선택이 잘 맞는 날',
  '우연처럼 보이지만 흐름이 따라오는 날',
  '평소보다 감이 빠르게 꽂히는 날',
  '별것 아닌 클릭 하나가 꽤 괜찮게 이어지는 날',
  '타이밍이 미묘하게 맞아떨어지는 날',
  '별 기대 안 했던 선택이 의외로 괜찮게 흘러가는 날',
  '대충 고른 게 생각보다 잘 맞아떨어지는 날',
  '사소한 판단 하나가 분위기를 바꿔놓는 날',
  '별 의미 없이 한 행동이 은근히 이어지는 날',
  '느낌대로 갔더니 결과가 따라오는 날',
  '조금 빠른 선택이 오히려 좋은 결과로 이어지는 날',
  '망설이다가 놓칠 뻔한 걸 간신히 잡는 날',
  '의식 안 했던 흐름이 자연스럽게 이어지는 날',
  '가볍게 던진 선택이 생각보다 길게 이어지는 날',
  '작은 차이가 결과를 바꿔버리는 날',
  '별 생각 없이 한 결정이 괜찮은 방향으로 흘러가는 날',
  '타이밍을 크게 의식 안 해도 맞아떨어지는 날',
  '한 번 더 고민할까 말까에서 그냥 가는 게 맞는 날',
  '지나치던 기회가 다시 눈에 들어오는 날',
  '무심코 넘긴 게 다시 연결되는 느낌이 드는 날',
  '평소보다 선택 속도가 결과에 영향을 주는 날',
  '애매했던 게 자연스럽게 정리되는 날',
  '굳이 힘 안 줘도 흐름이 만들어지는 날',
  '조용히 쌓인 선택들이 한 번에 이어지는 날',
  '크게 기대 안 한 쪽이 더 만족스러운 날',
  '괜히 고른 게 나중에 이유가 생기는 날',
  '생각보다 덜 고민한 선택이 더 깔끔한 결과로 이어지는 날',
  '흐름을 타기 시작하면 계속 이어지는 날',
  '어중간했던 선택이 의외로 정답이 되는 날',
  '타이밍 하나로 분위기가 확 바뀌는 날',
  '지나치려던 순간이 다시 잡히는 날',
  '별 의미 없이 시작한 일이 은근히 커지는 날',
  '감으로 밀어붙였는데 결과가 따라오는 날',
  '고민 길게 안 하는 게 오히려 이득인 날',
  '애매했던 방향이 점점 선명해지는 날',
  '의도하지 않았던 연결이 자연스럽게 이어지는 날',
  '대충 시작한 게 점점 형태를 갖추는 날',
  '한 번 흘린 선택이 다시 돌아오는 날',
  '작게 시작한 선택이 나중에 차이를 만드는 날',
  '느낌이 계속 맞아떨어지는 구간에 들어가는 날',
  '괜히 했던 선택이 나중에 납득되는 날',
  '생각보다 간단한 선택이 답이 되는 날',
  '타이밍이 조금만 어긋났어도 달라질 뻔한 날',
  '의식 안 해도 선택이 자연스럽게 이어지는 날',
  '한 번 잡은 흐름이 끊기지 않는 날',
  '별 기대 없이 시작했는데 점점 괜찮아지는 날',
  '고민보다 실행이 더 중요한 날',
  '지나간 선택이 다시 영향을 주는 날',
  '무심코 던진 선택이 계속 이어지는 날',
  '조금만 빨랐던 판단이 결과를 바꾸는 날',
]

const LUCKY_TIPS = [
  '첫 번째로 눈에 띈 일을 먼저 처리해 보세요.',
  '고민되면 짧게 움직이는 쪽이 이깁니다.',
  '메모 하나만 남겨도 오늘 운을 써먹은 겁니다.',
  '색이 끌리는 버튼을 눌러도 이상하게 잘 풀릴 수 있습니다.',
  '작은 정리가 오늘 컨디션을 크게 바꿉니다.',
  '지금 눈앞에 있는 것 하나만 정리해 보세요.',
  '3분만 써서 생각을 적어보면 흐름이 잡힙니다.',
  '고민되는 건 일단 가장 쉬운 쪽부터 건드려 보세요.',
  '손에 잡히는 일 하나만 끝내도 오늘은 충분합니다.',
  '지금 떠오른 아이디어를 그냥 넘기지 말고 기록해 보세요.',
  '작게라도 바로 실행해보는 쪽이 결과가 빠릅니다.',
  '잠깐 자리 정리만 해도 생각이 훨씬 정리됩니다.',
  '하던 것 말고 하나만 다른 방식으로 해보세요.',
  '오늘은 완벽보다 속도를 조금 더 우선해 보세요.',
  '지금 떠오른 선택지를 하나 바로 실행해 보세요.',
  '중간에 멈췄던 일을 다시 이어보는 것도 괜찮습니다.',
  '딱 한 단계만 더 진행해보는 걸 목표로 해보세요.',
  '오늘은 길게 고민하기보다 짧게 여러 번 시도해 보세요.',
  '눈에 보이는 것부터 처리하면 흐름이 따라옵니다.',
  '지금 할 수 있는 가장 단순한 행동부터 시작해 보세요.',
  '하나라도 끝내는 쪽에 집중해 보세요.',
  '머릿속 말고 손을 먼저 움직여 보세요.',
  '작은 수정 하나가 전체를 바꿀 수 있습니다.',
  '지금 생각난 걸 바로 실행으로 옮겨 보세요.',
  '조금 애매해도 일단 진행해보는 게 낫습니다.',
  '다른 사람 기준 말고 지금 내 기준으로 결정해 보세요.',
  '오늘은 선택을 미루지 않는 쪽이 좋습니다.',
  '잠깐 멈춰서 우선순위 하나만 정해보세요.',
  '하나를 끝내고 다음으로 넘어가는 리듬을 만들어 보세요.',
  '시작만 해도 절반은 한 겁니다.',
  '지금 가장 거슬리는 것부터 치워버리세요.',
  '딱 하나만 끝낸다는 생각으로 시작하세요.',
  '오늘은 속도 붙은 쪽을 계속 밀어보세요.',
  '괜히 멈추지 말고 흐름 이어가세요.',
  '지금 선택이 크게 틀리지 않을 가능성이 높습니다.',
  '생각보다 빠르게 결과가 보이기 시작할 수 있습니다.',
  '한 번 시작하면 생각보다 오래 이어질 수 있습니다.',
  '지금은 완벽보다 진행이 더 중요해 보입니다.',
  '조금 거칠어도 일단 밀고 가도 괜찮습니다.',
  '오늘은 판단이 평소보다 덜 흔들릴 수 있습니다.',
  '손 가는 대로 움직이면 흐름이 생길 수 있습니다.',
  '하나 끝내고 나면 다음도 자연스럽게 이어질 수 있습니다.',
  '괜히 복잡하게 만들지 않아도 풀릴 수 있습니다.',
  '지금은 선택을 쌓는 게 중요한 구간입니다.',
  '이미 시작한 걸 이어가는 쪽이 유리합니다.',
  '조금이라도 진행하면 전체 흐름이 바뀔 수 있습니다.',
  '오늘은 멈추는 타이밍이 아니라 이어가는 타이밍입니다.',
  '한 번 더 시도해보면 감이 잡힐 수 있습니다.',
  '굳이 크게 바꾸지 말고 작은 수정만 해보세요.',
  '지금 떠오른 걸 바로 테스트해보는 게 좋습니다.',
  '머릿속에서만 굴리지 말고 손으로 옮겨보세요.',
  '하던 방식에서 살짝만 틀어보세요.',
  '지금은 고민보다 반복이 더 도움이 됩니다.',
  '작게라도 결과를 확인하는 데 집중해 보세요.',
  '오늘은 선택을 줄이고 실행을 늘려보세요.',
  '조금 덜 준비된 상태로 시작해도 괜찮습니다.',
  '흐름이 끊기기 전에 하나 더 이어가 보세요.',
  '지금 타이밍에 멈추면 다시 시작하기 어려울 수 있습니다.',
  '오늘은 판단보다 반응이 빠른 쪽이 유리합니다.',
  '한 번 정한 건 끝까지 밀어보는 것도 방법입니다.',
]

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function getTodayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function pickBySeed<T>(items: readonly T[], seed: number, shift: number) {
  return items[(seed + shift) % items.length]
}

function getLuckyBundle(day: string): LuckyBundle {
  const seed = hashString(day)
  const color = pickBySeed(LUCKY_COLORS, seed, 3)
  const symbol = pickBySeed(LUCKY_SYMBOLS, seed, 7)
  const aura = pickBySeed(LUCKY_AURAS, seed, 11)
  const tip = pickBySeed(LUCKY_TIPS, seed, 19)

  return {
    day,
    number: (seed % 99) + 1,
    color,
    symbol,
    aura,
    tip,
  }
}

export default function DailyLuckCard() {
  const [day, setDay] = useState(() => getTodayKey())

  useEffect(() => {
    const syncDay = () => {
      const today = getTodayKey()
      setDay((prev) => (prev === today ? prev : today))
    }

    syncDay()

    const interval = window.setInterval(syncDay, 60 * 1000)
    window.addEventListener('focus', syncDay)
    document.addEventListener('visibilitychange', syncDay)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', syncDay)
      document.removeEventListener('visibilitychange', syncDay)
    }
  }, [])

  const lucky = useMemo(() => getLuckyBundle(day), [day])

  return (
    <section
      className="daily-luck-card mt-4 p-3"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${lucky.color.value} 18%, var(--card)) 0%, var(--card) 62%)`,
        borderColor: `color-mix(in srgb, ${lucky.color.value} 38%, var(--border))`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65">
            Lucky Today
          </div>
          <div className="mt-1 text-xs opacity-70">{lucky.day}</div>
        </div>
        <span className="badge">매일 갱신</span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
        <div>
          <div className="text-xs opacity-70">행운 번호</div>
          <div className="text-3xl font-black tracking-tight">
            {String(lucky.number).padStart(2, '0')}
          </div>
        </div>
        <div className="daily-luck-symbol">
          <span aria-hidden>{lucky.symbol}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border"
            style={{
              backgroundColor: lucky.color.value,
              borderColor: 'color-mix(in srgb, white 35%, transparent)',
              boxShadow: `0 0 0 4px color-mix(in srgb, ${lucky.color.value} 16%, transparent)`,
            }}
          />
          <span className="font-medium">{lucky.color.name}</span>
        </div>
        <p className="leading-5 opacity-80">{lucky.aura}</p>
        <p className="leading-5 opacity-70">{lucky.tip}</p>
      </div>
    </section>
  )
}
