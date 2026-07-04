import { prisma } from '@/app/lib/prisma'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'
import { getCurrentUser } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

type PermissionRow = {
  key: string
  label: string
  path: string
  requireLogin: boolean
  minRole: 'USER' | 'ADMIN'
  visible: boolean
}

type UserRole = 'USER' | 'ADMIN'

const DEFAULTS: PermissionRow[] = [
  {
    key: 'home',
    label: '메인',
    path: '/',
    requireLogin: false,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'dashboard',
    label: '대시보드',
    path: '/dashboard',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'blog',
    label: '블로그',
    path: '/blog',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'docs',
    label: 'Docs',
    path: '/docs',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'boards',
    label: '게시판',
    path: '/boards',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'todos',
    label: 'TODO',
    path: '/todos',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'calendar',
    label: '캘린더',
    path: '/calendar',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'diary',
    label: '일기장',
    path: '/diary',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'ledger',
    label: '가계부',
    path: '/ledger',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },
  {
    key: 'help',
    label: '고객 센터',
    path: '/help',
    requireLogin: true,
    minRole: 'USER',
    visible: true,
  },

  // 관리 메뉴 (사이드바에서는 기본 숨김. ADMIN만 /permission 접근 가능)
  {
    key: 'permission',
    label: '권한 관리',
    path: '/permission',
    requireLogin: true,
    minRole: 'ADMIN',
    visible: true,
  },
]

const permissionItemSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(80),
    path: z.string().trim().min(1).max(200),
    requireLogin: z.boolean(),
    minRole: z.enum(['USER', 'ADMIN']),
    visible: z.boolean(),
  })
  .strict()

const permissionUpdateSchema = z
  .object({
    items: z.array(permissionItemSchema).max(100),
  })
  .strict()

async function seedIfEmpty() {
  await prisma.menuPermission.createMany({
    data: DEFAULTS.map((d) => ({
      key: d.key,
      label: d.label,
      path: d.path,
      requireLogin: d.requireLogin,
      minRole: d.minRole,
      visible: d.visible,
    })),
    skipDuplicates: true,
  })

  // 과거 데이터(visible=false)도 자동 보정
  await prisma.menuPermission.upsert({
    where: { key: 'permission' },
    create: {
      key: 'permission',
      label: '권한 관리',
      path: '/permission',
      requireLogin: true,
      minRole: 'ADMIN',
      visible: true,
    },
    update: {
      label: '권한 관리',
      path: '/permission',
      requireLogin: true,
      minRole: 'ADMIN',
      visible: true,
    },
  })

  // 폐기된 메뉴 키 정리 (accounting → ledger 이름 변경 잔재 제거)
  await prisma.menuPermission.deleteMany({
    where: { key: { in: ['accounting'] } },
  })
}

async function getMeRole(): Promise<UserRole | null> {
  const me = await getCurrentUser()
  return me?.role ?? null
}

export async function GET(req: Request) {
  await seedIfEmpty()
  const rows: PermissionRow[] = await prisma.menuPermission.findMany({
    orderBy: { path: 'asc' },
    select: {
      key: true,
      label: true,
      path: true,
      requireLogin: true,
      minRole: true,
      visible: true,
    },
  })

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')
  const role = await getMeRole()
  const isAdmin = role === 'ADMIN'
  const loggedIn = !!role

  // 권한 관리 화면에서는 ADMIN만 전체 목록 조회 가능
  if (mode === 'manage') {
    if (!isAdmin)
      return Response.json({ message: 'forbidden' }, { status: 403 })
    return Response.json(rows)
  }

  // 사이드바 메뉴용: visibility + 로그인 + role 필터 적용
  const navRows = rows
    .filter((x: PermissionRow) => x.visible)
    .filter((x: PermissionRow) => (x.requireLogin ? loggedIn : true))
    .filter((x: PermissionRow) => (x.minRole === 'ADMIN' ? isAdmin : true))

  return Response.json(navRows)
}

export async function PUT(req: Request) {
  const me = await getCurrentUser()
  if (!me) return Response.json({ message: 'unauthorized' }, { status: 401 })
  if (me.role !== 'ADMIN')
    return Response.json({ message: 'forbidden' }, { status: 403 })

  await seedIfEmpty()

  const parsed = await parseJsonWithSchema(req, permissionUpdateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'bad request')
  const { items } = parsed.data

  // key 단위로 upsert
  await prisma.$transaction(
    items.map((it) =>
      prisma.menuPermission.upsert({
        where: { key: it.key },
        create: {
          key: it.key,
          label: it.label,
          path: it.path,
          requireLogin: it.requireLogin,
          minRole: it.minRole,
          visible: it.visible,
        },
        update: {
          label: it.label,
          path: it.path,
          requireLogin: it.requireLogin,
          minRole: it.minRole,
          visible: it.visible,
        },
      })
    )
  )

  return Response.json({ ok: true })
}
