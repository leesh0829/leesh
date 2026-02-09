import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Providers from "./components/Providers";
import AppShell from "./components/AppShell";
import ThemeToggle from "./components/ThemeToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leesh",
  description: "Portfolio + Blog + Boards + TODO + Calendar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <div className="fixed right-3 top-3 z-50 sm:right-4 sm:top-4">
            <ThemeToggle />
          </div>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
