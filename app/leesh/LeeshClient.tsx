'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import ImageUploadButton from '@/app/components/ImageUploadButton'
import MarkdownEditor from '@/app/components/MarkdownEditor'

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const message = record['message']
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed ? trimmed : null
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

type LeeshDoc = {
  id: string
  title: string
  contentMd: string
  canEdit: boolean
}

function GitHubIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.08-2.7-1.08-.36-.92-.89-1.16-.89-1.16-.73-.5.06-.49.06-.49.81.06 1.24.83 1.24.83.72 1.23 1.89.87 2.35.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.58.82-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.14 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.45.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export default function LeeshClient() {
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

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
      setUnlocked(true)
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
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('.leesh-page .scroll-reveal')
    )
    if (targets.length === 0) return

    targets.forEach((el, index) => {
      el.classList.add(`reveal-delay-${(index % 3) + 1}`)
    })

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) el.classList.add('is-visible')
          else el.classList.remove('is-visible')
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' }
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const doUnlock = async () => {
    if (!pw) return
    setUnlocking(true)
    setErr(null)

    const res = await fetch('/api/leesh/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '비밀번호가 틀렸습니다.'
      setErr(msg)
      setUnlocking(false)
      return
    }

    setPw('')
    setUnlocking(false)
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
      title: 'IoT Engineer | Junior Web Engineer',
      company: '스타트업 A (산업 설비 데이터 솔루션 기업)',
      period: '2025 - Present',
      items: [
        '4개 공장 설비 데이터를 통합 관리하는 웹 시스템 운영',
        'Spring 기반 웹 기능 개선 및 서비스 안정화 작업',
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
    <main className="container-page py-6 space-y-4 leesh-page">
      <section className="surface card-pad scroll-reveal">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] opacity-60">
              Portfolio
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">이승현</h1>
            <p className="mt-3 text-base leading-7 opacity-90 sm:text-lg">
              안녕하세요. 사용자 문제를 제품으로 빠르게 풀어내는 개발자입니다.
              서비스의 맥락을 이해하고, 작은 기능도 실제 사용 경험 관점에서
              설계합니다.
            </p>
            <p className="mt-3 text-base leading-7 opacity-90 sm:text-lg">
              데이터를 수집하고, 처리하고, 시각화하며 웹을 중심으로 시스템을
              연결하는 개발자입니다.
            </p>
            <p className="mt-2 text-base leading-7 opacity-90 sm:text-lg">
              실제 운영 환경에서 동작하는 서비스를 설계하고 개선합니다.
            </p>
            <p className="mt-2 text-sm font-medium opacity-70">
              웹을 중심으로, 시스템과 데이터를 연결하는 개발자
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {techStacks.map((stack) => (
                <span key={stack} className="badge">
                  {stack}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-4">
            <h2 className="text-sm font-semibold opacity-80">About me</h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6 opacity-90">
              {strengths.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-6 opacity-80">
              {aboutNarrative}
            </p>
          </div>
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <h2 className="text-xl font-semibold">핵심 역량</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {highlights.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-black/10 bg-black/[0.03] p-4"
            >
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 opacity-80">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <h2 className="text-2xl font-semibold">Experience</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {experiences.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-black/10 bg-black/[0.03] p-4"
            >
              <h3 className="text-base font-semibold">
                <span className="mr-2" aria-hidden>
                  {item.badge}
                </span>
                {item.title}
              </h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 opacity-90">
                {item.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <h2 className="text-2xl font-semibold">Career</h2>
        <div className="mt-4 grid gap-3">
          {careers.map((career) => (
            <article
              key={`${career.company}-${career.period}`}
              className="rounded-2xl border border-black/10 bg-black/[0.03] p-4"
            >
              <h3 className="text-base font-semibold">{career.title}</h3>
              <p className="mt-1 text-sm opacity-80">{career.company}</p>
              <p className="mt-1 text-xs opacity-65">{career.period}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 opacity-90">
                {career.items.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold">Projects</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {projects.map((project) => {
            const githubUrls = Array.isArray(project.githubUrls)
              ? project.githubUrls
              : []

            return (
              <article
                key={project.name}
                className="rounded-2xl border border-black/10 bg-black/[0.03] p-4"
              >
                <h3 className="text-base font-semibold">{project.name}</h3>
                <p className="mt-2 text-sm leading-6 opacity-80">
                  {project.summary}
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 opacity-90">
                  {project.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  {githubUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {githubUrls.map((url, index) => (
                        <a
                          key={`${project.name}-${url}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline h-8 w-8 p-0"
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
                      className="btn btn-outline h-8 w-8 p-0"
                      title={`${project.name} GitHub Repository`}
                      aria-label={`${project.name} GitHub Repository`}
                    >
                      <GitHubIcon />
                    </a>
                  ) : (
                    <span className="text-xs opacity-60">
                      GitHub 링크 추가 예정
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <h2 className="text-2xl font-semibold">Tech Stack</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {detailedTechStacks.map((item) => (
            <article
              key={item.category}
              className="rounded-2xl border border-black/10 bg-black/[0.03] p-4"
            >
              <h3 className="text-sm font-semibold">{item.category}</h3>
              <p className="mt-2 text-sm leading-6 opacity-85">{item.stacks}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface card-pad scroll-reveal">
        <h2 className="text-xl font-semibold">Direction</h2>
        <p className="mt-2 text-sm leading-7 opacity-85 sm:text-base">
          현재는 웹 개발에 가장 큰 관심을 두고 있으며, 데이터 처리와 시스템 구조
          이해를 기반으로 확장 가능한 웹 서비스를 만들고자 합니다.
        </p>
      </section>

      <section className="surface card-pad scroll-reveal">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Contact Me</h2>
          <span className="badge">문의 폼</span>
        </div>
        <p className="mt-1 text-sm opacity-70">
          협업, 프로젝트, 채용 관련 문의를 남겨주세요.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value)
              setContactErr(null)
              setContactDone(null)
            }}
            placeholder="이름 (선택)"
            maxLength={60}
          />
          <input
            className="input"
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

        <input
          className="input mt-2"
          value={contactSubject}
          onChange={(e) => {
            setContactSubject(e.target.value)
            setContactErr(null)
            setContactDone(null)
          }}
          placeholder="제목 (선택)"
          maxLength={120}
        />

        <textarea
          className="textarea mt-2"
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

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-xs opacity-60">
            {contactMessage.trim().length}/2000
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submitContact}
            disabled={contactSending}
          >
            {contactSending ? '전송중...' : '문의 보내기'}
          </button>
        </div>

        {contactErr ? (
          <p className="mt-2 text-sm text-red-600">{contactErr}</p>
        ) : null}
        {contactDone ? (
          <p className="mt-2 text-sm text-green-600">{contactDone}</p>
        ) : null}
      </section>

      {!unlocked ? (
        <section className="surface card-pad scroll-reveal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold">기록 / 블로그</h2>
              <p className="mt-1 text-sm opacity-70">
                기존 글 기능은 이 섹션에서 유지됩니다. 비밀번호로 접근 후 편집할
                수 있습니다.
              </p>

              {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline" onClick={load}>
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4 text-sm opacity-70">비밀번호를 입력하세요.</div>

          <div className="mt-3 grid gap-2 sm:max-w-md">
            <input
              className="input"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doUnlock()
              }}
            />

            <button
              className="btn btn-primary"
              onClick={doUnlock}
              disabled={unlocking || !pw}
            >
              {unlocking ? '확인중...' : '입장'}
            </button>

            <div className="text-xs opacity-60">
              엔터로도 입장 가능하게 해놨음.
            </div>
          </div>
        </section>
      ) : (
        <section className="card card-pad scroll-reveal">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="mt-1 text-sm opacity-70">추가로 하고픈 말</p>

              {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline" onClick={load}>
                새로고침
              </button>

              {unlocked && doc?.canEdit ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? '편집 닫기' : '편집'}
                </button>
              ) : null}

              {unlocked && doc?.canEdit && editing ? (
                <>
                  <ImageUploadButton
                    onUploaded={(url) => {
                      setDraft((prev) => `${prev}\n\n![](${url})\n`)
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? '저장중...' : '저장'}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {editing ? (
            <div className="mt-4 grid gap-3">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                rows={18}
                previewEmptyText="미리보기할 내용이 없습니다."
              />
              <div className="text-xs opacity-60">
                이미지 업로드 버튼 누르면 마크다운으로 자동 삽입됨.
              </div>
            </div>
          ) : (
            <article className="markdown-body mt-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeHighlight]}
                components={mdComponents}
              >
                {doc?.contentMd ?? ''}
              </ReactMarkdown>
            </article>
          )}
        </section>
      )}
    </main>
  )
}
