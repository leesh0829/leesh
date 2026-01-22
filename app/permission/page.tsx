import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import PermissionClient from './PermissionClient'

export const runtime = 'nodejs'

export default async function PermissionPage() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  if (!email) return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>

  const me = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  if (!me || me.role !== 'ADMIN') {
    return <main style={{ padding: 24 }}>권한 없음</main>
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1 style={{ marginBottom: 6 }}>/permission</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        메뉴별 권한(로그인 필요/최소 Role/사이드바 표시)을 관리합니다.
      </p>

      <PermissionClient />
    </main>
  )
}
