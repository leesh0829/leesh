import { Prisma } from '@prisma/client'

const DATABASE_CONNECTION_ERROR_CODES = new Set(['P1001', 'P1002'])

export function isDatabaseConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return DATABASE_CONNECTION_ERROR_CODES.has(error.code)
  }

  return (
    error instanceof Error &&
    error.message.includes("Can't reach database server")
  )
}
