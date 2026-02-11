import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Script from 'next/script'
import { cookies } from 'next/headers'

import Providers from './components/Providers'
import AppShell from './components/AppShell'
import ThemeToggle from './components/ThemeToggle'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Leesh',
  description: 'Portfolio + Blog + Boards + TODO + Calendar',
}

const THEME_COOKIE_KEY = 'leesh-theme'

function normalizeTheme(
  value: string | undefined
): 'light' | 'dark' | undefined {
  if (value === 'light' || value === 'dark') return value
  return undefined
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const cookieTheme = normalizeTheme(cookieStore.get(THEME_COOKIE_KEY)?.value)
  const initialTheme = cookieTheme ?? 'light'

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      className={initialTheme === 'dark' ? 'dark' : undefined}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = 'leesh-theme';
                  var cookieKey = '${THEME_COOKIE_KEY}';
                  function readCookie(name) {
                    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
                    return m ? decodeURIComponent(m[1]) : null;
                  }
                  function writeCookie(name, value) {
                    var secure = location.protocol === 'https:' ? '; secure' : '';
                    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; samesite=lax' + secure;
                  }
                  var saved = window.localStorage.getItem(key);
                  var fromCookie = readCookie(cookieKey);
                  var theme = saved === 'dark' || saved === 'light'
                    ? saved
                    : (fromCookie === 'dark' || fromCookie === 'light' ? fromCookie : '${initialTheme}');
                  var root = document.documentElement;
                  root.setAttribute('data-theme', theme);
                  if (theme === 'dark') root.classList.add('dark');
                  else root.classList.remove('dark');
                  window.localStorage.setItem(key, theme);
                  writeCookie(cookieKey, theme);
                } catch (e) {}
              })();
            `,
          }}
        />
        <Providers>
          <div className="fixed right-3 top-3 z-50 hidden lg:block sm:right-4 sm:top-4">
            <ThemeToggle />
          </div>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
