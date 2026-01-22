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

  // 메뉴 기본 정책
  const [menus, setMenus] = useState<MenuPerm[]>([])
  const [menuMsg, setMenuMsg] = useState('')

  // 사용자별 권한
  const [users, setUsers] = useState<UserRow[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [overrides, setOverrides] = useState<Record<string, OverrideModeUI>>({})
  const [userMsg, setUserMsg] = useState('')

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

    // UI 상태: 기본 DEFAULT로 깔고, 있는 것만 ALLOW/DENY로 덮기
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

  // 초기 로드
  useEffect(() => {
    ;(async () => {
      await loadMenus()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // menus가 로드된 뒤 사용자 로드
  useEffect(() => {
    if (menus.length === 0) return
    ;(async () => {
      await loadUsers()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus.length])

  // 선택 유저 바뀌면 오버라이드 로드
  useEffect(() => {
    if (!selectedUserId) return
    if (menus.length === 0) return
    ;(async () => {
      await loadOverrides(selectedUserId)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, menus.length])

  const menuKeys = useMemo(() => menus.map((m) => m.key), [menus])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setTab('MENU')}
          disabled={tab === 'MENU'}
        >
          메뉴 기본 설정
        </button>
        <button
          type="button"
          onClick={() => setTab('USER')}
          disabled={tab === 'USER'}
        >
          사용자별 권한
        </button>
      </div>

      {tab === 'MENU' ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={loadMenus}>
              새로고침
            </button>
            <button type="button" onClick={saveMenus}>
              저장
            </button>
            {menuMsg ? <span style={{ opacity: 0.7 }}>{menuMsg}</span> : null}
          </div>

          <div
            style={{
              marginTop: 12,
              border: '1px solid #eee',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr 120px 120px 90px',
                padding: 10,
                fontWeight: 700,
                background: '#fafafa',
              }}
            >
              <div>label</div>
              <div>path</div>
              <div>requireLogin</div>
              <div>minRole</div>
              <div>visible</div>
            </div>

            {menus.map((it, idx) => (
              <div
                key={it.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '220px 1fr 120px 120px 90px',
                  padding: 10,
                  borderTop: '1px solid #eee',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <input
                  value={it.label}
                  onChange={(e) => {
                    const v = e.target.value
                    setMenus((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, label: v } : p))
                    )
                  }}
                />

                <input
                  value={it.path}
                  onChange={(e) => {
                    const v = e.target.value
                    setMenus((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, path: v } : p))
                    )
                  }}
                />

                <label
                  style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                >
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

                <select
                  value={it.minRole}
                  onChange={(e) => {
                    const v = e.target.value as MenuPerm['minRole']
                    setMenus((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, minRole: v } : p))
                    )
                  }}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>

                <label
                  style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                >
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
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button type="button" onClick={loadUsers}>
              유저 새로고침
            </button>
            <button
              type="button"
              onClick={saveOverrides}
              disabled={!selectedUserId}
            >
              선택 유저 권한 저장
            </button>
            {userMsg ? <span style={{ opacity: 0.7 }}>{userMsg}</span> : null}
          </div>

          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              대상 유저
              <select
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

            <span style={{ fontSize: 12, opacity: 0.7 }}>
              DEFAULT=기본정책 그대로 / ALLOW=강제 허용 / DENY=강제
              차단(삭제하면 DEFAULT로 복귀)
            </span>
          </div>

          <div
            style={{
              marginTop: 12,
              border: '1px solid #eee',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr 160px',
                padding: 10,
                fontWeight: 700,
                background: '#fafafa',
              }}
            >
              <div>menu</div>
              <div>path</div>
              <div>override</div>
            </div>

            {menus.map((m) => {
              const mode = overrides[m.key] ?? 'DEFAULT'
              return (
                <div
                  key={m.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '220px 1fr 160px',
                    padding: 10,
                    borderTop: '1px solid #eee',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                  <div style={{ opacity: 0.8 }}>{m.path}</div>

                  <select
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
              )
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            팁: 특정 유저 권한 “삭제”는 override를 DEFAULT로 바꾸고 저장하면 됨.
          </div>
        </div>
      )}
    </div>
  )
}
