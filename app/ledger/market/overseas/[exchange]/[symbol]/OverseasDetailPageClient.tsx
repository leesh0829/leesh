'use client'

import { useRouter } from 'next/navigation'
import OverseasDetailModal from '@/app/ledger/market/OverseasDetailModal'

export default function OverseasDetailPageClient({
  exchange,
  symbol,
  name,
}: {
  exchange: string
  symbol: string
  name: string
}) {
  const router = useRouter()
  return (
    <OverseasDetailModal
      target={{ exchange, symbol, name }}
      variant="page"
      onClose={() => router.push('/ledger/market')}
    />
  )
}
