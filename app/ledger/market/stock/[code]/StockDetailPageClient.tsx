'use client'

import { useRouter } from 'next/navigation'
import StockDetailModal from '@/app/ledger/market/StockDetailModal'

export default function StockDetailPageClient({
  code,
  name,
}: {
  code: string
  name: string
}) {
  const router = useRouter()
  return (
    <StockDetailModal
      target={{ code, name }}
      variant="page"
      onClose={() => router.push('/ledger/market')}
    />
  )
}
