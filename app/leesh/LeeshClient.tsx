'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import MarkdownEditor from '@/app/components/MarkdownEditor'
import { sanitizedMarkdownSchema } from '@/app/lib/markdown'
import './leesh.css'

/**
 * Extracts a trimmed message string from an API-like payload object.
 *
 * @param payload - The value to inspect for a `message` property.
 * @returns The trimmed `message` string if present and non-empty, or `null` otherwise.
 */
function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const message = record['message']
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed ? trimmed : null
}

/**
 * Parse a Response body as JSON and return null when parsing fails.
 *
 * @returns The parsed JSON value, or `null` if the response body cannot be parsed as JSON.
 */
async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

type LeeshDoc = {
  id?: string
  title?: string
  contentMd: string
  unlocked: boolean
  canEdit: boolean
}

function GitHubIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.08-2.7-1.08-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.81.06 1.24.83 1.24.83.72 1.23 1.89.87 2.35.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.45.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

/**
 * Render the main Leesh portfolio page with content viewing, editable markdown, unlock/login modal, and a contact form.
 *
 * The component manages loading and saving the document, edit/unlock state, contact submission, scroll-reveal animations, and renders static profile, projects, career, and tech-stack sections alongside markdown content (read-only or editable).
 *
 * @returns The React element for the Leesh portfolio page.
 */
export default function LeeshClient() {
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [unlockErr, setUnlockErr] = useState<string | null>(null)

  const [doc, setDoc] = useState<LeeshDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactSubject, setContactSubject] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [contactSending, setContactSending] = useState(false)
  const [contactErr, setContactErr] = useState<string | null>(null)
  const [contactDone, setContactDone] = useState<string | null>(null)

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const mdComponents: Parameters<typeof ReactMarkdown>[0]['components'] =
    useMemo(
      () => ({
        h1: (props) => <h1 {...props} className="mt-6 text-2xl font-bold" />,
        h2: (props) => <h2 {...props} className="mt-5 text-xl font-semibold" />,
        h3: (props) => <h3 {...props} className="mt-4 text-lg font-semibold" />,
        p: (props) => <p {...props} className="mt-2 leading-7" />,
        ul: (props) => <ul {...props} className="mt-2 list-disc pl-5" />,
        ol: (props) => <ol {...props} className="mt-2 list-decimal pl-5" />,
        li: (props) => <li {...props} className="mt-1" />,
        a: (props) => <a {...props} className="underline" />,
        pre: (props) => (
          <pre
            {...props}
            className="mt-3 overflow-x-auto rounded-xl border p-3 text-sm"
          />
        ),
        code: (props) => {
          const { className, children, ...rest } = props
          const isBlock =
            typeof className === 'string' && className.includes('language-')
          if (isBlock)
            return (
              <code {...rest} className={className}>
                {children}
              </code>
            )
          return (
            <code
              {...rest}
              className="rounded-md border bg-black/5 px-1 py-0.5 text-[0.85em]"
            >
              {children}
            </code>
          )
        },
        img: ({ alt, src, ...props }) => {
          const safeSrc = typeof src === 'string' ? src.trim() : ''
          if (!safeSrc) return null
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...props}
              src={safeSrc}
              alt={alt ?? ''}
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
            />
          )
        },
      }),
      []
    )

  const load = async () => {
    setErr(null)
    const res = await fetch('/api/leesh', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as LeeshDoc
      setDoc(data)
      setDraft(data.contentMd ?? '')
      setUnlocked(Boolean(data.unlocked))
      if (!data.canEdit) setEditing(false)
      return
    }

    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '불러오기 실패'
    const human = toHumanHttpError(res.status, msg)
    setErr(human ?? `${res.status} · ${msg}`)
    setUnlocked(false)
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      load()
    })
  }, [])

  useEffect(() => {
    if (showUnlockModal) return
    setPw('')
    setUnlockErr(null)
  }, [showUnlockModal])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.leesh-page')
    if (!root) return

    // Scroll-Driven 지원 브라우저는 CSS 타임라인이 진입을 구동 → JS 관찰 불필요
    const hasSatl =
      typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')
    if (hasSatl) return

    // 폴백 모드 진입: 초기 숨김 규칙 활성화
    root.classList.add('no-satl')

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.rv, .cell, .leesh-timeline .tl-item, .leesh-listing, .leesh-block, .leesh-form'
      )
    )
    if (targets.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-visible'))
      return
    }

    if (typeof window.IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-visible'))
      return
    }

    const isMobileViewport = window.matchMedia('(max-width: 640px)').matches

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) el.classList.add('is-visible')
          else el.classList.remove('is-visible')
        })
      },
      {
        threshold: isMobileViewport ? 0.04 : 0.12,
        rootMargin: isMobileViewport ? '0px 0px -4% 0px' : '0px 0px -10% 0px',
      }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [mounted])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof CSS === 'undefined' ||
      CSS.supports('animation-timeline: scroll()')
    ) {
      return
    }
    const bar = document.querySelector<HTMLElement>('.leesh-page .leesh-prog')
    if (!bar) return
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      const p = max > 0 ? doc.scrollTop / max : 0
      bar.style.setProperty('--leesh-prog', String(p))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof window.IntersectionObserver === 'undefined') return

    const countUp = (el: HTMLElement) => {
      let node: ChildNode | null = null
      for (const cn of Array.from(el.childNodes)) {
        if (cn.nodeType === 3 && cn.nodeValue && cn.nodeValue.trim()) {
          node = cn
          break
        }
      }
      if (!node || node.nodeValue === null) return
      const m = node.nodeValue.trim().match(/^(\D*?)(\d+)(\D*)$/)
      if (!m) return
      const pre = m[1]
      const len = m[2].length
      const target = parseInt(m[2], 10)
      const suf = m[3]
      if (/[A-Za-z가-힣]/.test(pre)) return
      const dur = 900
      let t0: number | null = null
      const frame = (t: number) => {
        if (t0 === null) t0 = t
        const p = Math.min((t - t0) / dur, 1)
        const e = 1 - Math.pow(1 - p, 3)
        node!.nodeValue =
          pre + String(Math.round(target * e)).padStart(len, '0') + suf
        if (p < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            countUp(entry.target as HTMLElement)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.6 }
    )
    document
      .querySelectorAll<HTMLElement>('.leesh-page .readout .m .n')
      .forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [mounted])

  const onStackMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget.querySelector<HTMLElement>('.stack')
    if (!el) return
    const r = e.currentTarget.getBoundingClientRect()
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1
    el.style.setProperty('--rx', `${nx * 34}deg`)
    el.style.setProperty('--ry', `${-ny * 26}deg`)
  }
  const onStackLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget.querySelector<HTMLElement>('.stack')
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  const doUnlock = async () => {
    if (!pw) return
    setUnlocking(true)
    setUnlockErr(null)

    const res = await fetch('/api/leesh/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '비밀번호가 틀렸습니다.'
      setUnlockErr(msg)
      setUnlocking(false)
      return
    }

    setPw('')
    setUnlocking(false)
    setShowUnlockModal(false)
    await load()
  }

  const save = async () => {
    if (!doc?.canEdit) return
    setSaving(true)
    setErr(null)

    const res = await fetch('/api/leesh', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentMd: draft }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '저장 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
      setSaving(false)
      return
    }

    const updated = (await res.json()) as LeeshDoc
    setDoc((prev) => (prev ? { ...prev, contentMd: updated.contentMd } : prev))
    setEditing(false)
    setSaving(false)
  }

  const canSendContact =
    contactEmail.trim().length > 0 && contactMessage.trim().length >= 10

  const submitContact = async () => {
    if (contactSending) return

    if (!canSendContact) {
      setContactErr('이메일과 메시지(10자 이상)를 입력해 주세요.')
      setContactDone(null)
      return
    }

    setContactSending(true)
    setContactErr(null)
    setContactDone(null)

    try {
      const res = await fetch('/api/leesh/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          message: contactMessage,
        }),
      })

      if (!res.ok) {
        const payload = await readJsonSafely(res)
        const msg = extractApiMessage(payload) ?? '문의 전송 실패'
        const human = toHumanHttpError(res.status, msg)
        setContactErr(human ?? `${res.status} · ${msg}`)
        return
      }

      setContactDone('문의가 전송되었습니다. 확인 후 답변드릴게요.')
    } catch {
      setContactErr('네트워크 오류로 문의 전송에 실패했습니다.')
    } finally {
      setContactSending(false)
    }
  }

  const strengths = [
    '실행 가능한 서비스를 끝까지 완성하는 제품 개발자',
    '문제 정의부터 운영까지 책임지는 오너십',
    '빠른 실험과 안정적인 개선 사이 균형을 추구',
  ]

  const techStacks = ['Webs', 'Apps', 'IoT', 'Service']

  const highlights = [
    {
      title: 'Service-Oriented Development',
      description:
        '기획부터 개발, 배포, 운영까지 사용자 가치 중심으로 서비스를 개선합니다.',
    },
    {
      title: 'System & Data Understanding',
      description:
        '데이터 흐름과 시스템 구조를 이해하고, 연결 관점에서 기능을 설계합니다.',
    },
    {
      title: 'Documentation & Communication',
      description:
        '기능만 만드는 것이 아니라 문서화와 전달 가능한 결과물로 팀 생산성을 높입니다.',
    },
  ]

  const aboutNarrative =
    '웹 서비스 개발과 운영을 경험하며 사용자 중심의 기능 구현과 유지보수를 수행해왔습니다. 동시에 산업 설비와 연동된 프로그램 개발을 통해 데이터 수집, 통신, 실시간 처리 구조를 이해했습니다. 단순 기능 구현을 넘어, 구조와 흐름을 이해하며 설계하는 개발자가 되고자 합니다.'

  const experiences = [
    {
      badge: '🌐',
      title: 'Web Service Development',
      items: [
        'Spring / Spring Boot 기반 백엔드 개발',
        'React / Next.js 기반 프론트엔드 개발',
        'MySQL / MSSQL 데이터베이스 설계 및 운영',
        '서비스 배포 및 운영/유지보수 경험 (실사용 환경)',
        '현장 장애 대응 및 안정화 경험',
      ],
    },
    {
      badge: '🏭',
      title: 'Industrial & Desktop System Development',
      items: [
        'OPC UA / Modbus 기반 산업 데이터 수집',
        'C# (WPF, WinForm, DevExpress) 기반 모니터링 프로그램 개발',
        'RedisDB 활용 실시간 데이터 처리',
        'WM_COPYDATA 기반 프로세스 간 통신 구현',
        '실제 현장 운영 및 유지보수 경험',
        '설비 → 서버 → 클라이언트로 이어지는 데이터 흐름 구조 이해 및 개선 경험',
      ],
    },
  ]

  const careers = [
    {
      title: 'Junior Web Engineer',
      company: '스타트업 A (웹 솔루션 기업)',
      period: '2024.09 - 2024.11 (Internship)',
      items: [
        '공장 설비 데이터 수집 및 관리 목적의 MES 웹 시스템을 초기 설계부터 프론트엔드·백엔드까지 직접 구현',
        'Node.js, NestJS 기반 API 서버와 React / Next.js 기반 웹 인터페이스를 개발하여 설비 데이터 조회 및 관리 기능 구축',
        '실시간 설비 데이터 시각화 및 관리 페이지 등 공장 운영을 위한 웹 대시보드 기능 개발',
        '인터넷 쇼핑 사이트 판매 데이터 기반 통계 조회 웹 서비스 개발 및 데이터 시각화 기능 구현',
        '웹 서비스 구조 설계, API 설계, 프론트엔드 상태 관리 등 전체 웹 서비스 개발 과정 경험',
      ],
    },
    {
      title: 'IoT Engineer | Junior Web Engineer',
      company: '스타트업 B (산업 설비 데이터 솔루션 기업)',
      period: '2025 - Present',
      items: [
        '4개 공장 설비 데이터를 통합 관리하는 웹 시스템 운영',
        'Spring / Spring Boot 기반 웹 기능 개선 및 서비스 안정화 작업',
        '실시간 설비 데이터 수집 및 원격 설비 제어 기능 구현',
        '산업 장비 -> 서버 -> 웹 클라이언트 간 데이터 흐름 설계 및 개선',
        '현장 이슈 대응 및 서비스 안정성 개선 작업 수행',
        '운영 중 발생한 데이터 통신 오류 개선을 통해 안정성 향상',
      ],
    },
  ]

  const projects = [
    {
      name: 'FocusBuddy',
      tags: ['.NET 8', 'WPF', 'LiveCharts2', 'IPC'],
      summary: '.NET 8 / WPF 기반 생산성 관리 프로그램',
      points: [
        'LiveCharts2 기반 실시간 사용 시간 시각화 기능 구현',
        'IPC (WM_COPYDATA) 구현',
        '프로세스 감지 기능 구현',
        'IPC 통신 안정성 개선을 통한 데이터 전달 누락 최소화',
        'WPF UI와 백그라운드 프로세스 간 데이터 흐름 설계',
      ],
      githubUrl: 'https://github.com/leesh0829/FocusBuddy',
    },
    {
      name: 'Portfolio (leesh)',
      tags: ['React', 'Next.js', 'TypeScript'],
      summary: 'React / Next 기반 포트폴리오 웹 서비스',
      points: [
        '직접 설계 및 구현',
        '사용자 흐름 중심 UI/기능 개선',
        '상태 기반 UI 구조 설계로 컴포넌트 재사용성 개선 및 향상',
        '반응형 레이아웃 및 접근성 고려',
        '배포 및 도메인 연결 경험',
      ],
      githubUrl: 'https://github.com/leesh0829/leesh',
    },
    {
      name: 'High School Game Projects (3)',
      tags: ['Unity', 'C#'],
      summary: 'Unity 기반 게임 제작 프로젝트',
      points: [
        '기획 ~ 구현 전 과정 참여',
        '교내 전시 경험',
        '기능 충돌 및 밸런스 이슈를 테스트 기반으로 개선',
      ],
      githubUrls: [
        'https://github.com/leesh0829/2024MDP_1',
        'https://github.com/leesh0829/2024MDP_2',
        'https://github.com/leesh0829/2024MDP_3',
      ],
    },
    {
      name: 'Notiva',
      tags: ['Next.js', 'FastAPI', 'Celery', 'pgvector'],
      summary: 'Next.js + FastAPI 기반 AI 음성 기록 및 요약 웹 서비스',
      points: [
        'STT → 요약 → 임베딩 인덱싱을 Celery 비동기 파이프라인으로 처리',
        '전사 데이터 임베딩 + 벡터 검색 기반 RAG Q&A 기능 구현',
        'PostgreSQL / pgvector 기반 전사·요약 데이터 구조 설계',
      ],
      githubUrl: 'https://github.com/leesh0829/Notiva',
    },
    {
      name: 'Nope.exe',
      tags: ['Win32 API', 'C#', 'P/Invoke'],
      summary: 'Win32 API 기반 윈도우 창 자동 제어 유틸리티',
      points: [
        'EnumWindows 등 Win32 API를 P/Invoke로 연동해 창 메타데이터 수집',
        'JSON 규칙 엔진 기반 창 제어(닫기/숨김/프로세스 종료) 구현',
        '쿨다운 로직 및 비동기 모니터 루프로 안정적 자동화 처리',
      ],
      githubUrl: 'https://github.com/leesh0829/Nope.exe',
    },
    {
      name: 'tyPeng',
      tags: ['.NET 8', 'WPF'],
      summary: '.NET 8 WPF 기반 투명 오버레이 타자 연습 애플리케이션',
      points: [
        'IME 우회 한글 두벌식 조합기(HangulComposer) 직접 구현',
        '실시간 타이핑 지표(CPM/WPM/정확도) 계산 로직 설계',
        '투명 오버레이 UI와 타이핑 엔진 구조 분리 설계',
      ],
      githubUrl: 'https://github.com/leesh0829/typeng',
    },
  ]

  const detailedTechStacks = [
    {
      category: 'Backend',
      stacks: 'Java (Spring, Spring Boot), Node.js, Python',
    },
    {
      category: 'Frontend',
      stacks: 'React, Next.js, TypeScript, JavaScript, HTML, CSS',
    },
    {
      category: 'Desktop',
      stacks: 'C# (WPF, WinForm, DevExpress)',
    },
    {
      category: 'Industrial / Communication',
      stacks: 'OPC UA, Modbus, WM_COPYDATA, Redis',
    },
    {
      category: 'Database',
      stacks: 'MySQL, MSSQL (Experience: PostgreSQL)',
    },
  ]

  return (
    <main className={`leesh-page${mounted ? ' js' : ''}`}>
      <div className="leesh-prog" aria-hidden />
      <div className="leesh-frame" aria-hidden>
        <i className="tl" />
        <i className="tr" />
        <i className="bl" />
        <i className="br" />
      </div>
      <nav className="leesh-nav">
        <div className="mk">
          <span className="tgt" aria-hidden />
          LEESH <small>/ 포트폴리오</small>
        </div>
        <div className="lk">
          <a href="#s01">01</a>
          <a href="#s02">02</a>
          <a href="#s03">03</a>
          <a href="#s04">04</a>
          <a href="#s05">05</a>
          <a href="#s06">06</a>
          <a href="#s07">07</a>
          <a href="#s08">08</a>
          <a href="#s09">09</a>
        </div>
      </nav>
      <div className="leesh-main">
      <header className="leesh-hero" id="top">
        <div className="hero-top">
          <div className="hero-copy">
            <div className="tag">PORTFOLIO · 이승현</div>
            <h1>
              <span className="l1">
                웹을 중심으로, <span className="ink">시스템과 데이터를</span>
              </span>
              <span className="l2">연결하는 개발자</span>
            </h1>
            <p className="sub">
              안녕하세요. 사용자 문제를 제품으로 빠르게 풀어내는 개발자입니다.
              서비스의 맥락을 이해하고, 작은 기능도{' '}
              <b>실제 사용 경험 관점</b>에서 설계합니다.
            </p>
          </div>

          <div
            className="hero-3d"
            onMouseMove={onStackMove}
            onMouseLeave={onStackLeave}
          >
            <span className="hero-3d-tag">◲ DEV MONITOR · 3D</span>
            <span className="hero-3d-hint">↔ 마우스로 기울이기</span>
            <div className="stack" aria-hidden>
              <div className="monitor">
                <div className="mon-screen">
                  <div className="mon-front">
                    <div className="mon-frame">
                      <div className="mon-bar">
                        <span className="dot r" />
                        <span className="dot y" />
                        <span className="dot g" />
                        <span className="fn">
                          leesh/page<span className="ext">.tsx</span>
                        </span>
                      </div>
                      <div className="mon-code">
                        <b />
                        <b />
                        <b />
                        <b />
                        <b />
                        <b />
                      </div>
                      <div className="mon-term">$ npm run dev</div>
                    </div>
                  </div>
                  <div className="mon-back" />
                  <div className="mon-side top" />
                  <div className="mon-side bottom" />
                  <div className="mon-side left" />
                  <div className="mon-side right" />
                </div>
                <div className="mon-neck" />
                <div className="mon-base" />
              </div>
            </div>
          </div>
        </div>

        <div className="marq">
          <div className="row">
            <b>
              {techStacks.map((stack) => stack.toUpperCase()).join(' · ')} ✳{' '}
            </b>
            <b>
              {techStacks.map((stack) => stack.toUpperCase()).join(' · ')} ✳{' '}
            </b>
          </div>
        </div>

        <div className="herometa">
          <div className="readout">
            <div className="m">
              <div className="n">{String(projects.length).padStart(2, '0')}</div>
              <div className="k">프로젝트</div>
            </div>
            <div className="m">
              <div className="n">{String(careers.length).padStart(2, '0')}</div>
              <div className="k">경력</div>
            </div>
            <div className="m">
              <div className="n">
                {String(detailedTechStacks.length).padStart(2, '0')}
              </div>
              <div className="k">기술 분야</div>
            </div>
            <div className="m">
              <div className="n">
                00<span className="u">↔</span>
              </div>
              <div className="k">진행형 성장</div>
            </div>
          </div>
          <div className="titleblk">
            <div className="r">
              <span>Name</span>
              <b>이승현 (leesh)</b>
            </div>
            <div className="r">
              <span>Focus</span>
              <b>Web · IoT · Data</b>
            </div>
            <div className="r">
              <span>Stack</span>
              <b>Spring · Next.js · C#</b>
            </div>
            <div className="r">
              <span>Status</span>
              <b>Open to work</b>
            </div>
          </div>
        </div>
      </header>

      {/* About me — 히어로 아래 이어붙임 */}
      <section id="s00" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">00</span>
          <span className="kick">About me · 소개</span>
          <span className="dim">SHEET 00</span>
        </div>
        <p className="leesh-lead rv">
          데이터를 수집하고, 처리하고, 시각화하며 웹을 중심으로 시스템을
          연결하는 개발자입니다. 실제 운영 환경에서 동작하는 서비스를 설계하고
          개선합니다.
        </p>
        <ul className="leesh-block" style={{ listStyle: 'none' }}>
          {strengths.map((item) => (
            <li key={item} className="leesh-lead" style={{ marginTop: 10 }}>
              → {item}
            </li>
          ))}
        </ul>
        <p className="leesh-lead">{aboutNarrative}</p>
      </section>

      <section id="s01" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">01</span>
          <span className="kick">Core Competency · 핵심 역량</span>
          <span className="dim">SHEET 01</span>
        </div>
        <h2 className="rv">핵심 역량</h2>
        <div className="leesh-grid g3 rv">
          {highlights.map((item, i) => (
            <article key={item.title} className="cell">
              <div className="ix">{String(i + 1).padStart(2, '0')} · CAP</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="s02" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">02</span>
          <span className="kick">Experience · 실무 경험</span>
          <span className="dim">SHEET 02</span>
        </div>
        <h2 className="rv">Experience</h2>
        <div className="leesh-grid g2 rv">
          {experiences.map((item, i) => (
            <article key={item.title} className="cell">
              <div className="ix">
                {String(i + 1).padStart(2, '0')} ·{' '}
                <span aria-hidden>{item.badge}</span>
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="s03" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">03</span>
          <span className="kick">Career · 경력</span>
          <span className="dim">SHEET 03</span>
        </div>
        <h2 className="rv">Career</h2>
        <ol className="leesh-timeline rv">
          {careers.map((career) => (
            <li key={`${career.company}-${career.period}`} className="tl-item">
              <span className="tl-period">{career.period}</span>
              <div className="tl-role">{career.title}</div>
              <div className="tl-co">{career.company}</div>
              <ul>
                {career.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section id="s04" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">04</span>
          <span className="kick">Projects · 프로젝트</span>
          <span className="dim">SHEET 04</span>
        </div>
        <h2 className="rv">Projects</h2>
        <div className="leesh-grid g3 rv">
          {projects.map((project, i) => {
            const githubUrls = Array.isArray(project.githubUrls)
              ? project.githubUrls
              : []

            return (
              <article key={project.name} className="cell">
                <div className="ix">{String(i + 1).padStart(2, '0')} · PROJ</div>
                <h3>{project.name}</h3>
                <p>{project.summary}</p>
                {project.tags && project.tags.length > 0 ? (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap' }}>
                    {project.tags.map((t) => (
                      <span key={t} className="leesh-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
                <ul>
                  {project.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 14 }}>
                  {githubUrls.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {githubUrls.map((url, index) => (
                        <a
                          key={`${project.name}-${url}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="leesh-iconbtn"
                          title={`${project.name} - Game Repo ${index + 1}`}
                          aria-label={`${project.name} - Game Repo ${index + 1}`}
                        >
                          <GitHubIcon />
                        </a>
                      ))}
                    </div>
                  ) : project.githubUrl ? (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="leesh-iconbtn"
                      title={`${project.name} GitHub Repository`}
                      aria-label={`${project.name} GitHub Repository`}
                    >
                      <GitHubIcon />
                    </a>
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      GitHub 링크 추가 예정
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section id="s05" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">05</span>
          <span className="kick">GitHub · 활동</span>
          <span className="dim">SHEET 05</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="rv">GitHub</h2>
          <a
            href="https://github.com/leesh0829"
            target="_blank"
            rel="noreferrer"
            className="leesh-btn"
            aria-label="leesh0829 GitHub 프로필 열기"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>

        <figure className="leesh-listing rv">
          <figcaption>
            <span className="d" />
            leesh0829 · contribution graph
            <span className="lbl">ghchart</span>
          </figcaption>
          <div className="body">
            <a
              href="https://github.com/leesh0829"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', minWidth: 720 }}
              aria-label="GitHub 잔디 크게 보기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://ghchart.rshah.org/6d5aff/leesh0829"
                alt="leesh0829 GitHub contribution chart"
                style={{ height: 'auto', width: '100%' }}
              />
            </a>
          </div>
        </figure>
      </section>

      <section id="s06" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">06</span>
          <span className="kick">Tech Stack · 기술</span>
          <span className="dim">SHEET 06</span>
        </div>
        <h2 className="rv">Tech Stack</h2>
        <div className="leesh-grid g2 rv">
          {detailedTechStacks.map((item, i) => (
            <article key={item.category} className="cell">
              <div className="ix">{String(i + 1).padStart(2, '0')} · STACK</div>
              <h3>{item.category}</h3>
              <p>{item.stacks}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="s07" className="leesh-section inv rv">
        <div className="leesh-head">
          <span className="no">07</span>
          <span className="kick">Direction · 지향</span>
          <span className="dim">SHEET 07</span>
        </div>
        <h2 className="rv">Direction</h2>
        <p className="leesh-lead rv">
          현재는 웹 개발에 가장 큰 관심을 두고 있으며, 데이터 처리와 시스템 구조
          이해를 기반으로 확장 가능한 웹 서비스를 만들고자 합니다.
        </p>
      </section>

      <section id="s08" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">08</span>
          <span className="kick">Contact · 문의</span>
          <span className="dim">SHEET 08</span>
        </div>
        <h2 className="rv">Contact Me</h2>
        <p className="leesh-lead rv">
          협업, 프로젝트, 채용 관련 문의를 남겨주세요.
        </p>

        <div className="leesh-form rv">
          <div className="frow">
            <div>
              <label className="flabel">Name</label>
              <input
                className="leesh-input"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value)
                  setContactErr(null)
                  setContactDone(null)
                }}
                placeholder="이름 (선택)"
                maxLength={60}
              />
            </div>
            <div>
              <label className="flabel">Email *</label>
              <input
                className="leesh-input"
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value)
                  setContactErr(null)
                  setContactDone(null)
                }}
                placeholder="회신 받을 이메일 *"
                maxLength={120}
              />
            </div>
          </div>

          <label className="flabel">Subject</label>
          <input
            className="leesh-input"
            value={contactSubject}
            onChange={(e) => {
              setContactSubject(e.target.value)
              setContactErr(null)
              setContactDone(null)
            }}
            placeholder="제목 (선택)"
            maxLength={120}
          />

          <label className="flabel">Message</label>
          <textarea
            className="leesh-textarea"
            value={contactMessage}
            onChange={(e) => {
              setContactMessage(e.target.value)
              setContactErr(null)
              setContactDone(null)
            }}
            placeholder="메시지 내용을 입력해 주세요. (10자 이상)"
            rows={5}
            maxLength={2000}
            style={{ resize: 'vertical' }}
          />

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--muted)',
              }}
            >
              {contactMessage.trim().length}/2000
            </div>
            <button
              type="button"
              className="leesh-btn primary"
              onClick={submitContact}
              disabled={contactSending}
            >
              {contactSending ? '전송중...' : '문의 보내기'}
            </button>
          </div>

          {contactErr ? (
            <p className="text-sm text-red-600" style={{ marginTop: 10 }}>
              {contactErr}
            </p>
          ) : null}
          {contactDone ? (
            <p className="text-sm text-green-600" style={{ marginTop: 10 }}>
              {contactDone}
            </p>
          ) : null}
        </div>
      </section>

      <section id="s09" className="leesh-section rv">
        <div className="leesh-head">
          <span className="no">09</span>
          <span className="kick">Notes · 추가로 하고픈 말</span>
          <span className="dim">SHEET 09</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 className="rv">Notes</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="leesh-btn" onClick={load}>
              새로고침
            </button>

            {!unlocked ? (
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setShowUnlockModal(true)}
              >
                로그인
              </button>
            ) : null}

            {doc?.canEdit ? (
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? '편집 닫기' : '편집'}
              </button>
            ) : null}

            {doc?.canEdit && editing ? (
              <button
                type="button"
                className="leesh-btn primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? '저장중...' : '저장'}
              </button>
            ) : null}
          </div>
        </div>

        {err ? (
          <p className="text-sm text-red-600" style={{ marginTop: 10 }}>
            {err}
          </p>
        ) : null}

        {editing ? (
          <div className="leesh-block" style={{ marginTop: 20 }}>
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              rows={18}
              previewEmptyText="미리보기할 내용이 없습니다."
              htmlMode="raw"
            />
          </div>
        ) : (
          <article className="markdown-body leesh-block" style={{ marginTop: 20 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[
                rehypeRaw,
                [rehypeSanitize, sanitizedMarkdownSchema],
                rehypeHighlight,
              ]}
              components={mdComponents}
            >
              {doc?.contentMd ?? ''}
            </ReactMarkdown>
          </article>
        )}
      </section>
      </div>

      <footer className="leesh-footer">
        <div className="mk">◱ LEESH · PORTFOLIO</div>
        <div className="sm">
          이승현 · 웹을 중심으로 시스템과 데이터를 연결하는 개발자
        </div>
      </footer>

      {showUnlockModal ? (
        <div className="leesh-modal-overlay">
          <button
            type="button"
            className="leesh-modal-scrim"
            aria-label="로그인 팝업 닫기"
            onClick={() => setShowUnlockModal(false)}
          />
          <div className="leesh-modal">
            <div className="mhead">
              <div>
                <div className="mtitle">로그인</div>
                <div className="msub">비밀번호를 입력하세요.</div>
              </div>
              <button
                type="button"
                className="leesh-btn"
                onClick={() => setShowUnlockModal(false)}
              >
                X
              </button>
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              <input
                className="leesh-input"
                type="password"
                value={pw}
                autoFocus
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doUnlock()
                }}
              />

              <button
                type="button"
                className="leesh-btn primary"
                onClick={doUnlock}
                disabled={unlocking || !pw}
              >
                {unlocking ? '확인중...' : '입장'}
              </button>
            </div>

            {unlockErr ? (
              <p className="text-sm text-red-600" style={{ marginTop: 12 }}>
                {unlockErr}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
