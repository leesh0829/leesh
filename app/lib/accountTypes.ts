export const ACCOUNT_TYPES = [
  'SALARY',
  'LIVING',
  'CHECKING',
  'SAVINGS',
  'EMERGENCY',
  'STOCK',
  'ISA',
  'PENSION',
  'BUSINESS',
  'SHARED',
  'CORPORATE',
  'FOREIGN_CURRENCY',
  'SHOPPING',
  'CEREMONIAL',
  'CARD',
  'FIXED_EXPENSE',
  'TRANSPORT',
  'OTHER',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

// 법적·물리적으로 단독 계좌인 타입 — 한 계좌가 이들 중 하나를 가지면 다른 타입과 섞을 수 없음
export const STOCK_TYPES = ['STOCK', 'ISA', 'PENSION'] as const

export function isStockType(t: AccountType): boolean {
  return (STOCK_TYPES as readonly string[]).includes(t)
}

export function hasStockType(types: AccountType[]): boolean {
  return types.some(isStockType)
}

// 계좌 types 배열 검증:
// - 비어있으면 안 됨
// - 중복 없음
// - STOCK/ISA/PENSION이 포함되면 그것만 1개여야 함 (다른 타입과 못 섞음)
export function validateAccountTypes(types: AccountType[]): string | null {
  if (!Array.isArray(types) || types.length === 0)
    return '계좌 유형을 최소 1개 선택해 주세요.'
  const set = new Set(types)
  if (set.size !== types.length) return '중복된 유형이 있습니다.'
  const stockOnes = types.filter(isStockType)
  if (stockOnes.length > 1)
    return '주식/ISA/연금은 한 계좌에 하나만 지정할 수 있습니다.'
  if (stockOnes.length === 1 && types.length > 1)
    return '주식/ISA/연금 타입은 다른 유형과 함께 지정할 수 없습니다.'
  return null
}

export const TYPE_LABEL_KR: Record<AccountType, string> = {
  SALARY: '급여',
  LIVING: '생활비',
  CHECKING: '일반 입출금',
  SAVINGS: '저축',
  EMERGENCY: '비상금',
  STOCK: '주식/종합',
  ISA: 'ISA',
  PENSION: '연금',
  BUSINESS: '사업',
  SHARED: '공동',
  CORPORATE: '법인',
  FOREIGN_CURRENCY: '외화',
  SHOPPING: '쇼핑',
  CEREMONIAL: '경조사',
  CARD: '카드',
  FIXED_EXPENSE: '고정지출',
  TRANSPORT: '교통',
  OTHER: '기타',
}
