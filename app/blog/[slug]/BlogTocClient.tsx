'use client'

import SectionTocClient, {
  type TocHeading,
} from '@/app/components/SectionTocClient'

export default function BlogTocClient({
  headings,
}: {
  headings: TocHeading[]
}) {
  return <SectionTocClient headings={headings} title="본문 목차" />
}
