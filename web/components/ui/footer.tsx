import Link from 'next/link';
import OwnixLogo from '@/app/ownix-logo.svg';

export default function Footer() {
  return (
    <footer className="flex flex-col gap-3 border-t border-line py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 items-center ">
        <OwnixLogo
          aria-hidden="true"
          focusable="false"
          className="h-7 w-7"
        />
        <p className="gap-1 flex items-center text-sm leading-6">
          <span className="font-semibold mr-1 text-body">Ownix</span>
          <span className="italic">your internet,</span>
          <span className="font-mono">indexed.</span>
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/privacy"
          className="transition-ui hover:text-ink focus:outline-none focus:ring-2 focus:ring-signal focus:ring-offset-2 focus:ring-offset-surface"
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          className="transition-ui hover:text-ink focus:outline-none focus:ring-2 focus:ring-signal focus:ring-offset-2 focus:ring-offset-surface"
        >
          Terms
        </Link>
      </div>
    </footer>
  );
}
