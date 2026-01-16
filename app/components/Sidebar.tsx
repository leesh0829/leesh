"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const NAV = [
  { href: "/", label: "메인" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/blog", label: "블로그" },
  { href: "/boards", label: "게시판" },
  { href: "/todos", label: "TODO" },
  { href: "/calendar", label: "캘린더" },
];

function NavItem({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={
        "block rounded-md px-3 py-2 text-sm transition " +
        (active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-900")
      }
    >
      {label}
    </Link>
  );
}

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname() ?? "/";
  const { data: session, status } = useSession();

  const userLabel =
    session?.user?.name ||
    session?.user?.email ||
    (status === "loading" ? "로딩..." : "비로그인");

  return (
    <>
      {/* mobile overlay */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={
          "fixed z-50 h-dvh w-64 border-r border-zinc-200 bg-white p-4 transition-transform dark:border-zinc-800 dark:bg-black lg:static lg:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" onClick={onClose} className="text-base font-bold">
            Leesh
          </Link>
          <button
            type="button"
            className="rounded-md border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 lg:hidden"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <nav className="grid gap-1">
          {NAV.map((n) => (
            <NavItem
              key={n.href}
              href={n.href}
              label={n.label}
              active={pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href))}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-6 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <div className="mb-2 font-semibold">계정</div>
          <div className="truncate opacity-80">{userLabel}</div>

          <div className="mt-3 flex gap-2">
            {session?.user ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                onClick={onClose}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs opacity-60">
          <div>Next.js + Prisma + PostgreSQL</div>
          <div>Blog / Boards / TODO / Calendar</div>
        </div>
      </aside>
    </>
  );
}