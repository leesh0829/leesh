import type { ReactNode } from 'react'
import { Anton, IBM_Plex_Mono } from 'next/font/google'

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export default function LeeshLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Pretendard: 한글 본문/제목 (CDN) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
      />
      <div className={`${anton.variable} ${plexMono.variable}`}>{children}</div>
    </>
  )
}
