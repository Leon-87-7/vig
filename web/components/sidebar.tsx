'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Rss,
  Brain,
  LayoutGrid,
  MessageSquareText,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Feed', icon: Rss },
  { href: '/brain', label: 'Brain', icon: Brain },
  { href: '/spaces', label: 'Spaces', icon: LayoutGrid },
  { href: '/prompts', label: 'Prompts', icon: MessageSquareText },
  { href: '/controls', label: 'Controls', icon: SlidersHorizontal },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/')
    return pathname === '/' || pathname.startsWith('/jobs');
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkBase =
  'rounded-md text-sm font-medium transition-colors duration-150 ease-out-quart';

/**
 * Collapsible navigation (DESIGN.md "Operator's Console").
 * Collapsed: a slim rail showing the favicon logo + per-page icons (active in signal).
 * Expanded: a slide-in drawer with the "vig" wordmark + icon-and-label rows.
 * The wordmark only appears when expanded; collapsed shows the logo alone.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Collapsed rail — always visible. Favicon logo + per-page icons. */}
      <div className="flex w-16 shrink-0 flex-col items-center border-r border-line bg-surface py-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="vig-nav-panel"
          className="mb-6 flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150 ease-out-quart hover:bg-signal-bright"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="vig"
            width={28}
            height={28}
            className="h-7 w-7"
          />
        </button>

        <nav
          className="flex flex-col items-center gap-1"
          aria-label="Primary"
        >
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 w-9 items-center justify-center ${linkBase} ${
                  active
                    ? 'bg-raised text-signal'
                    : 'text-body hover:bg-raised hover:text-ink'
                }`}
              >
                <Icon
                  className="h-[18px] w-[18px]"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Expand navigation"
          className="mt-auto flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out-quart hover:bg-raised hover:text-ink"
        >
          <ChevronRight
            className="h-[18px] w-[18px]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-out-quart ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Expanded panel — slide-in drawer with the "vig" wordmark + icon-and-label rows. */}
      <aside
        id="vig-nav-panel"
        aria-label="Primary navigation"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-line bg-surface px-4 py-5 shadow-[0px_2px_4px_rgba(0,0,0,0.4),0px_12px_24px_-8px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out-quart ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-1">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
            />
            vig
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Collapse navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out-quart hover:bg-raised hover:text-ink"
          >
            <ChevronLeft
              className="h-[18px] w-[18px]"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </div>

        <nav
          className="flex flex-col gap-1"
          aria-label="Primary expanded"
        >
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                tabIndex={open ? undefined : -1}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 ${linkBase} ${
                  active
                    ? 'bg-raised text-signal'
                    : 'text-body hover:bg-raised hover:text-ink'
                }`}
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <form
            action="/api/auth/logout"
            method="POST"
          >
            <button
              type="submit"
              tabIndex={open ? undefined : -1}
              className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-muted transition-colors duration-150 ease-out-quart hover:bg-raised hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
