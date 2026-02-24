import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function parseJsonWithSchema<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
){
  const body = await req.json().catch(() => null)
  return schema.safeParse(body)
}

export function badRequestFromZod(
  error: z.ZodError,
  fallbackMessage = 'invalid body'
) {
  const firstMessage = error.issues[0]?.message
  const message =
    firstMessage && !firstMessage.startsWith('Invalid input')
      ? firstMessage
      : fallbackMessage
  return NextResponse.json({ message }, { status: 400 })
}
