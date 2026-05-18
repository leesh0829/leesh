import StockDetailPageClient from './StockDetailPageClient'

export const runtime = 'nodejs'

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams?: Promise<{ name?: string }>
}) {
  const { code } = await params
  const sp = (await searchParams) ?? {}
  const name =
    typeof sp.name === 'string' && sp.name.trim() ? sp.name.trim() : code

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <StockDetailPageClient code={code} name={name} />
    </main>
  )
}
