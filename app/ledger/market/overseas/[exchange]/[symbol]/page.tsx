import OverseasDetailPageClient from './OverseasDetailPageClient'

export const runtime = 'nodejs'

export default async function OverseasDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ exchange: string; symbol: string }>
  searchParams?: Promise<{ name?: string }>
}) {
  const { exchange, symbol } = await params
  const sp = (await searchParams) ?? {}
  const name =
    typeof sp.name === 'string' && sp.name.trim()
      ? sp.name.trim()
      : `${exchange}:${symbol}`

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <OverseasDetailPageClient
        exchange={exchange}
        symbol={symbol}
        name={name}
      />
    </main>
  )
}
