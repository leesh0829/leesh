import type { Prisma } from '@prisma/client'

export function buildOwnedGeneralBoardsQuery(
  userId: string
): Prisma.BoardFindManyArgs {
  return {
    where: { type: 'GENERAL', ownerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { owner: { select: { name: true, email: true } } },
  }
}
