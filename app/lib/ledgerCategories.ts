export type LedgerEntryType = 'INCOME' | 'EXPENSE'

export type CategorySpec = {
  key: string
  label: string
  subcategories: string[]
}

export const INCOME_CATEGORIES: CategorySpec[] = [
  { key: '월급', label: '월급', subcategories: ['기본급', '시간외 수당', '기타'] },
  {
    key: '보너스',
    label: '보너스',
    subcategories: ['상여금', '성과급', '명절 휴가비', '기타'],
  },
  {
    key: '환급금',
    label: '환급금',
    subcategories: ['연말정산 환급금', '세금 환급', '보험금 수령', '기타'],
  },
  {
    key: '주식/이자',
    label: '주식/이자',
    subcategories: ['배당금', '은행 이자', '투자 수익(실현손익)', '기타'],
  },
  {
    key: '용돈',
    label: '용돈',
    subcategories: ['부모님', '기타(이외)'],
  },
  {
    key: '경조사비',
    label: '경조사비',
    subcategories: ['축의금', '부조금', '기타'],
  },
  {
    key: '수익',
    label: '수익',
    subcategories: ['부업 수익', '중고거래', '기타'],
  },
  { key: '계좌이체', label: '계좌이체', subcategories: [] },
  { key: '기타', label: '기타', subcategories: [] },
]

export const EXPENSE_CATEGORIES: CategorySpec[] = [
  {
    key: '주거',
    label: '주거',
    subcategories: ['월세', '대출이자', '관리비', '기타'],
  },
  {
    key: '통신',
    label: '통신',
    subcategories: ['휴대폰 요금', '인터넷/TV 결합 상품', '기타'],
  },
  {
    key: '보험',
    label: '보험',
    subcategories: ['실손보험', '생명보험', '자동차 보험', '기타'],
  },
  {
    key: '구독',
    label: '구독',
    subcategories: ['OTT', '음원스트리밍', '각종 멤버쉽', '기타'],
  },
  {
    key: '학습',
    label: '학습',
    subcategories: ['학원비', '정기 교육비', '기타'],
  },
  { key: '고정비 기타', label: '고정비 기타', subcategories: [] },
  {
    key: '식비',
    label: '식비',
    subcategories: ['식재료', '외식', '배달', '카페/간식', '기타'],
  },
  {
    key: '생활',
    label: '생활',
    subcategories: ['생필품', '편의점', '잡화', '기타'],
  },
  {
    key: '쇼핑',
    label: '쇼핑',
    subcategories: ['의류', '신발', '액세서리', '전자제품', '화장품', '기타'],
  },
  {
    key: '교통',
    label: '교통',
    subcategories: ['대중교통', '택시', '주유', '통행료', '기타'],
  },
  {
    key: '의료/건강',
    label: '의료/건강',
    subcategories: ['병원비', '약국', '운동/헬스', '기타'],
  },
  {
    key: '문화/여가',
    label: '문화/여가',
    subcategories: ['영화', '공연', '여행', '취미 활동', '기타'],
  },
  {
    key: '경조사/선물',
    label: '경조사/선물',
    subcategories: ['선물 구입비', '경조사비 지출', '기타'],
  },
  { key: '자기계발', label: '자기계발', subcategories: [] },
  {
    key: '주식/이자',
    label: '주식/이자',
    subcategories: [
      '매수/투자금 입금',
      '거래 수수료',
      '세금',
      '투자 손실(실현손익)',
      '기타',
    ],
  },
  { key: '변동비 기타', label: '변동비 기타', subcategories: [] },
  { key: '계좌이체', label: '계좌이체', subcategories: [] },
  { key: '기타', label: '기타', subcategories: [] },
]

export function getCategoriesByType(type: LedgerEntryType): CategorySpec[] {
  return type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export function isValidCategoryCombination(
  type: LedgerEntryType,
  category: string,
  subcategory: string | null
): boolean {
  const list = getCategoriesByType(type)
  const spec = list.find((c) => c.key === category)
  if (!spec) return false
  if (!subcategory) return true
  return spec.subcategories.includes(subcategory)
}
