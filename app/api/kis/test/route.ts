import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { testKisCredentials } from '@/app/lib/kisAuth'

export const runtime = 'nodejs'

const schema = z
  .object({
    appKey: z.string().trim().min(1),
    appSecret: z.string().trim().min(1),
    isLive: z.boolean().optional().default(true),
  })
  .strict()

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, schema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const result = await testKisCredentials(parsed.data)
  if (result.ok) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
}
