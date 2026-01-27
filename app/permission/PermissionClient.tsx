'use client'

import { useEffect, useMemo, useState } from 'react'

type MenuPerm = {
  key: string
  label: string
  path: string
  requireLogin: boolean
  minRole: 'USER' | 'ADMIN'
  visible: boolean
}

type UserRow = {
  id: string
  email: string | null
  name: string | null
  role: 'USER' | 'ADMIN'
  createdAt: string
}

type UserOverride = {
  menuKey: string
  mode: 'ALLOW' | 'DENY'
}

type OverrideModeUI = 'DEFAULT' | 'ALLOW' | 'DENY'

export default function PermissionClient() {
  const [tab, setTab] = useState<'MENU' | 'USER'>('MENU')

  const [menus, setMenus] = useState<MenuPerm[]>([])
  const [menuMsg, setMenuMsg] = useState('')

  const [users, setUsers] = useState<UserRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [overrides, setOverrides] = useState<Record<string, OverrideModeUI>>({})
  const [userMsg, setUserMsg] = useState('')

  const menuKeys = useMemo(() => menus.map((m) => m.key), [menus])

  const loadMenus = async () => {
    setMenuMsg('')
    const r = await fetch('/api/permission', { cache: 'no-store' })
    if (!r.ok) {
      setMenuMsg(`${r.status} ${r.statusText}`)
      setMenus([])
      return
    }
    setMenus((await r.json()) as MenuPerm[])
  }

  const saveMenus = async () => {
    setMenuMsg('')
    const r = await fetch('/api/permission', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: menus }),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setMenuMsg(
        `저장 실패: ${r.status} ${r.statusText} (${d?.message ?? 'unknown'})`
      )
      return
    }
    setMenuMsg('저장 완료')
  }

  const loadUsers = async () => {
    setUserMsg('')
    const r = await fetch('/api/permission/users', { cache: 'no-store' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setUserMsg(
        `유저 로드 실패: ${r.status} ${r.statusText} (${d?.message ?? 'unknown'})`
      )
      setUsers([])
      return
    }
    const data = (await r.json()) as UserRow[]
    setUsers(data)
    if (!selectedUserId && data[0]?.id) setSelectedUserId(data[0].id)
  }

  const loadOverrides = async (userId: string) => {
    setUserMsg('')
    const r = await fetch(`/api/permission/users/${userId}/overrides`, {
      cache: 'no-store',
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setUserMsg(
        `오버라이드 로드 실패: ${r.status} ${r.statusText} (${d?.message ?? 'unknown'})`
      )
      setOverrides({})
      return
    }
    const rows = (await r.json()) as UserOverride[]

    const base: Record<string, OverrideModeUI> = {}
    for (const m of menus) base[m.key] = 'DEFAULT'
    for (const row of rows) base[row.menuKey] = row.mode
    setOverrides(base)
  }

  const saveOverrides = async () => {
    if (!selectedUserId) return
    setUserMsg('')

    const payload = Object.entries(overrides)
      .filter(([, mode]) => mode !== 'DEFAULT')
      .map(([menuKey, mode]) => ({ menuKey, mode: mode as 'ALLOW' | 'DENY' }))

    const r = await fetch(`/api/permission/users/${selectedUserId}/overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: payload }),
    })

    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setUserMsg(
        `저장 실패: ${r.status} ${r.statusText} (${d?.message ?? 'unknown'})`
      )
      return
    }
    setUserMsg('저장 완료')
  }

  // 초기 로드 (lint: effect body에서 setState를 직접 트리거하지 않도록 microtask로 분리)
  useEffect(() => {
    Promise.resolve().then(() => {
      void loadMenus()
    })
  }, [])

  // menus 로드 후 사용자 로드
  useEffect(() => {
    if (menus.length === 0) return
    Promise.resolve().then(() => {
      void loadUsers()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus.length])

  // 선택 유저 바뀌면 오버라이드 로드
  useEffect(() => {
    if (!selectedUserId) return
    if (menus.length === 0) return
    Promise.resolve().then(() => {
      void loadOverrides(selectedUserId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, menus.length])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={'btn ' + (tab === 'MENU' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setTab('MENU')}
        >
          메뉴 기본 설정
        </button>
        <button
          type="button"
          className={'btn ' + (tab === 'USER' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setTab('USER')}
        >
          사용자별 권한
        </button>
      </div>

      {tab === 'MENU' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadMenus}
            >
              새로고침
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveMenus}
            >
              저장
            </button>
            {menuMsg ? (
              <span className="text-sm opacity-70">{menuMsg}</span>
            ) : null}
          </div>

          <div className="surface overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[220px_1fr_120px_120px_90px] md:gap-3 md:px-4 md:py-3 md:text-sm md:font-semibold">
              <div>label</div>
              <div>path</div>
              <div>requireLogin</div>
              <div>minRole</div>
              <div>visible</div>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {menus.map((it, idx) => (
                <div
                  key={it.key}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[220px_1fr_120px_120px_90px] md:items-center"
                >
                  <div className="grid gap-1">
                    <div className="text-xs opacity-60 md:hidden">label</div>
                    <input
                      className="input"
                      value={it.label}
                      onChange={(e) => {
                        const v = e.target.value
                        setMenus((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, label: v } : p
                          )
                        )
                      }}
                    />
                  </div>

                  <div className="grid gap-1">
                    <div className="text-xs opacity-60 md:hidden">path</div>
                    <input
                      className="input"
                      value={it.path}
                      onChange={(e) => {
                        const v = e.target.value
                        setMenus((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, path: v } : p
                          )
                        )
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.requireLogin}
                        onChange={(e) => {
                          const v = e.target.checked
                          setMenus((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, requireLogin: v } : p
                            )
                          )
                        }}
                      />
                      필요
                    </label>
                  </div>

                  <div className="grid gap-1">
                    <div className="text-xs opacity-60 md:hidden">minRole</div>
                    <select
                      className="select"
                      value={it.minRole}
                      onChange={(e) => {
                        const v = e.target.value as MenuPerm['minRole']
                        setMenus((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, minRole: v } : p
                          )
                        )
                      }}
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.visible}
                        onChange={(e) => {
                          const v = e.target.checked
                          setMenus((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, visible: v } : p
                            )
                          )
                        }}
                      />
                      표시
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadUsers}
            >
              유저 새로고침
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveOverrides}
              disabled={!selectedUserId}
            >
              선택 유저 권한 저장
            </button>
            {userMsg ? (
              <span className="text-sm opacity-70">{userMsg}</span>
            ) : null}
          </div>

          <div className="surface card-pad space-y-2">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">대상 유저</span>
              <select
                className="select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? '(no-name)'} · {u.email ?? '(no-email)'} ·{' '}
                    {u.role}
                  </option>
                ))}
              </select>
            </label>

            <div className="text-xs opacity-70">
              DEFAULT=기본정책 그대로 / ALLOW=강제 허용 / DENY=강제
              차단(삭제하면 DEFAULT로 복귀)
            </div>
          </div>

          <div className="surface overflow-hidden">
            <div className="hidden md:grid md:grid-cols-[220px_1fr_160px] md:gap-3 md:px-4 md:py-3 md:text-sm md:font-semibold">
              <div>menu</div>
              <div>path</div>
              <div>override</div>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {menus.map((m) => {
                const mode = overrides[m.key] ?? 'DEFAULT'
                return (
                  <div
                    key={m.key}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[220px_1fr_160px] md:items-center"
                  >
                    <div>
                      <div className="text-xs opacity-60 md:hidden">menu</div>
                      <div className="font-semibold">{m.label}</div>
                    </div>
                    <div>
                      <div className="text-xs opacity-60 md:hidden">path</div>
                      <div className="text-sm opacity-80">{m.path}</div>
                    </div>
                    <div>
                      <div className="text-xs opacity-60 md:hidden">
                        override
                      </div>
                      <select
                        className="select"
                        value={mode}
                        onChange={(e) => {
                          const v = e.target.value as OverrideModeUI
                          setOverrides((prev) => ({ ...prev, [m.key]: v }))
                        }}
                      >
                        <option value="DEFAULT">DEFAULT</option>
                        <option value="ALLOW">ALLOW</option>
                        <option value="DENY">DENY</option>
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {menuKeys.length === 0 ? null : (
            <div className="text-xs opacity-70">
              팁: 특정 유저 권한 “삭제”는 override를 DEFAULT로 바꾸고 저장하면
              됨.
            </div>
          )}
        </section>
      )}
    </div>
  )
}
