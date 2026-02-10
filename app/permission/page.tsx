import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import PermissionClient from './PermissionClient'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'

export default async function PermissionPage() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  if (!email) {
    redirect('/')
  }

  const me = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  if (!me || me.role !== 'ADMIN') {
    redirect('/')
  }

  return (
    <main className="space-y-4">
      <div>
        <div className="text-xs opacity-60">Admin</div>
        <h1 className="text-2xl font-semibold">/permission</h1>
        <p className="mt-1 text-sm opacity-70">
          메뉴별 권한(로그인 필요/최소 Role/사이드바 표시)을 관리합니다.
        </p>
      </div>

      <div className="surface card-pad card-hover-border-only">
        <PermissionClient />
      </div>
    </main>
  )
}
