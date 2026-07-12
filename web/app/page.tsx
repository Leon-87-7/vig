import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroGradient } from '@/components/hero-gradient';
import { AppSlot } from '@/components/landing/app-slot';
import { GoogleDriveIcon } from '@/components/svg/google-drive-icon';

export const metadata: Metadata = {
  title: 'Ownix — Your internet, indexed',
  description:
    'Share videos, articles, and repos to Ownix from any app. Three taps, and a minute later the transcript and summary are in your Index — searchable, agent-ready markdown.',
};

const btnGhost =
  'inline-flex h-8 items-center justify-center rounded-md border border-line bg-transparent px-3.5 text-[13px] font-medium leading-none text-ink transition-ui hover:bg-raised';
const btnSignal =
  'inline-flex h-8 items-center justify-center rounded-md bg-signal px-3.5 text-[13px] font-medium leading-none text-onsignal transition-ui hover:bg-signal-bright active:bg-signal-deep';

const indexBadges = [
  ['SHORT · REELS · TIKTOK', 'text-type-short'],
  ['LONG VIDEO', 'text-type-long'],
  ['ARTICLE · PDF', 'text-type-article'],
  ['REPO', 'text-type-repo'],
];

const tiles = [
  ['Items indexed', '260'],
  ['Links extracted', '623'],
  ['Videos transcribed', '207'],
  ['Repos collected', '35'],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-canvas text-body">
      <nav aria-label="Main" className="border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-baseline gap-3 rounded-sm no-underline">
            <strong className="text-xl font-semibold tracking-tight text-ink">
              Ownix
            </strong>
            <span className="font-mono text-xs text-muted">
              your internet, indexed
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className={btnGhost}>
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <header className="relative isolate overflow-hidden py-12">
        <HeroGradient />
        {/* Legibility scrim: copy sits on near-canvas, the shader's hot
            corners survive toward the right edge. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(13,14,16,0.94)_0%,rgba(13,14,16,0.8)_45%,rgba(13,14,16,0.45)_75%,rgba(13,14,16,0.15)_100%)]"
        />
        <div className="mx-auto max-w-[960px] px-6">
          <p className="mb-4 text-sm font-medium text-muted">
            The friend you send everything to.
          </p>
          <h1 className="mb-6 max-w-[16ch] text-[clamp(30px,6vw,52px)] font-semibold leading-[1.15] tracking-[-0.5px] text-ink">
            You watched it. You liked it.{' '}
            <span className="text-muted">You lost it.</span>
          </h1>
          <p className="mb-8 max-w-[56ch] text-base leading-relaxed text-body">
            Share to Ownix from <AppSlot /> — three taps, and a minute
            later it&apos;s in your{' '}
            <span className="font-medium text-ink">Index</span>:
            transcribed, summarized, searchable, ready to paste into
            your AI.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#invite" className={btnSignal}>
              Get an invite
            </a>
            <Link href="/restricted" className={btnGhost}>
              Look inside
            </Link>
            <span className="ml-2 font-mono text-xs text-muted">
              invite-only for now
            </span>
          </div>
        </div>
      </header>

      <section aria-labelledby="h-capture" className="border-t border-line py-12">
        <div className="mx-auto max-w-[960px] px-6">
          <h2
            id="h-capture"
            className="mb-4 text-[clamp(22px,3.4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink"
          >
            Three taps. Nothing new to learn.
          </h2>
          <p className="mb-6 max-w-[58ch] text-[15px] leading-relaxed">
            It&apos;s the share sheet you already use — aimed at Ownix
            instead of a friend. Mid-doomscroll, mid-commute,
            mid-anything: share it, keep scrolling. Ownix does the
            reading.
          </p>

          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {/*
              DROP THE SCREEN RECORDING HERE.
              Replace the placeholder div with:
              <video controls preload="metadata" poster="/demo-poster.jpg" className="block w-full">
                <source src="/demo-capture.mp4" type="video/mp4" />
              </video>
              Recording flow: YouTube share sheet -> Telegram bot reply -> item in the Ownix feed.
            */}
            <div className="flex aspect-video flex-col items-center justify-center gap-3 border-b border-line bg-canvas">
              <div
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-body"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2.5v11l9-5.5z" />
                </svg>
              </div>
              <p className="font-mono text-xs text-muted">
                demo-capture.mp4 · share sheet → bot → Index
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
              <span className="font-mono text-xs text-body">
                17:24 shared ·{' '}
                <b className="font-medium text-status-done">
                  17:24 transcript ready
                </b>{' '}
                · 17:30 full analysis
              </span>
              <span className="text-xs font-medium text-muted">
                Real capture, real time. No cuts.
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2" aria-label="What Ownix indexes">
            {indexBadges.map(([label, color]) => (
              <span
                key={label}
                className={`rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.4px] ${color}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="h-agent" className="border-t border-line py-12">
        <div className="mx-auto max-w-[960px] px-6">
          <h2
            id="h-agent"
            className="mb-4 text-[clamp(22px,3.4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink"
          >
            Doomscroll in, engineering standards out.
          </h2>

          <div className="grid items-start gap-6 md:grid-cols-2">
            <div className="text-[15px] leading-relaxed">
              <p className="mb-4">
                An Instagram reel about post-launch support was about to
                fly past me, like everything does. I shared it to Ownix,
                got the full transcript back, and pasted it into Codex —
                which turned it into the support-playbook rules for
                another project I&apos;m building.
              </p>
              <p className="mb-4">
                A reel became rules in a production codebase.
              </p>
              <p className="font-mono text-xs text-muted">
                — Leon, building Ownix
              </p>
            </div>

            <div
              className="overflow-hidden rounded-lg border border-line bg-surface"
              aria-label="The actual transcript file"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="font-mono text-[11px] tracking-[0.4px] text-muted">
                  20260711_144906_48FB971E_transcript.md
                </span>
                <span className="rounded-sm bg-status-done-tint px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.4px] text-status-done">
                  DONE
                </span>
              </div>
              <pre className="max-h-[280px] overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-body [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent)] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
                <span className="text-muted"># Transcript</span>
                {'\n\n'}
                <span className="text-muted">**Source:**</span>{' '}
                instagram.com/reel/DamFvyUj3U0
                {'\n'}
                <span className="text-muted">**Platform:**</span>{' '}
                instagram_reels
                {'\n'}
                <span className="text-muted">**Processed:**</span>{' '}
                2026-07-11T14:49:36
                {'\n\n---\n\n'}
                Your AI assistant built your app and shipped{'\n'}
                it to production. Customers, they&apos;re now{'\n'}
                paying for it. And at 2:00 in the morning,{'\n'}
                a customer can&apos;t log in. So, tell me, who{'\n'}
                handles that? Your AI assistant? Probably{'\n'}
                not, because it&apos;s not connected to your{'\n'}
                production system. So your AI assistant{'\n'}
                built the product, but nobody told it to{'\n'}
                build the support system too...
              </pre>
            </div>
          </div>

          <p className="mt-6 max-w-[58ch] text-[15px] leading-relaxed">
            Every item in your Index has copy-a-segment and copy-all, or
            grab the whole{' '}
            <code className="rounded-sm border border-line bg-surface px-[5px] py-px font-mono text-xs text-ink">
              .md
            </code>{' '}
            file. Claude, Cursor, Codex — they all eat markdown.
          </p>
        </div>
      </section>

      <section aria-labelledby="h-compounds" className="border-t border-line py-12">
        <div className="mx-auto max-w-[960px] px-6">
          <h2
            id="h-compounds"
            className="mb-4 text-[clamp(22px,3.4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink"
          >
            It compounds — and it&apos;s yours.
          </h2>
          <p className="mb-6 max-w-[58ch] text-[15px] leading-relaxed">
            One month of casual saving, no effort beyond the share
            button:
          </p>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map(([cap, val]) => (
              <div
                key={cap}
                className="rounded-lg border border-line bg-surface px-4 py-3"
              >
                <span className="mb-1 block font-mono text-[11px] font-medium uppercase tracking-[0.4px] text-muted">
                  {cap}
                </span>
                <span className="text-[28px] font-semibold leading-[1.1] text-ink tabular-nums">
                  {val}
                </span>
              </div>
            ))}
          </div>

          <p className="mb-6 max-w-[58ch] text-[15px] leading-relaxed">
            Browse by thumbnail, search by title or topic, and pull up
            every link a video ever mentioned — the course, the repo,
            the tool — long after the video itself scrolled away.
          </p>

          <div className="flex max-w-[58ch] items-start gap-3 rounded-lg border border-line bg-surface p-4">
            <GoogleDriveIcon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
            <p className="text-sm leading-normal">
              Everything also lands in your Google Drive as markdown.{' '}
              <span className="font-medium text-ink">
                Your files, your account — leave anytime and lose
                nothing.
              </span>
            </p>
          </div>
        </div>
      </section>

      <section id="invite" aria-labelledby="h-invite" className="border-t border-line py-12">
        <div className="mx-auto max-w-[960px] px-6">
          <div className="rounded-lg border border-line bg-surface p-8">
            <h2
              id="h-invite"
              className="mb-3 text-[clamp(22px,3.4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink"
            >
              Invite-only for now.
            </h2>
            <p className="mb-6 max-w-[52ch] text-[15px] leading-relaxed">
              Sign in with Telegram and drop your email — I approve
              every member personally, usually within a few hours. Early
              members get a direct line to me and shape what gets built
              next.
            </p>
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-telegram-blue px-4 text-[13px] font-medium leading-none text-white transition-[filter] duration-150 ease-out hover:brightness-[1.08] focus-visible:outline-telegram-ring"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M21.9 4.5L2.7 11.9c-1.3.5-1.3 1.3-.2 1.6l4.9 1.5 1.9 5.8c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9l3.3-15.4c.3-1.3-.5-1.9-1.7-1.8z" />
              </svg>
              Sign in with Telegram
            </Link>
            <p className="mt-3 font-mono text-xs text-muted">
              no password · approval within hours, not weeks
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[960px] px-6">
        <p className="border-t border-line py-6 text-[13px] text-muted">
          A shared Brain is growing quietly underneath all of this —
          early members shape it.
        </p>
      </div>

      <footer className="border-t border-line pb-12 pt-6">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6">
          <span className="font-mono text-xs text-muted">
            Ownix — your internet, indexed.
          </span>
          <div className="flex gap-4">
            <Link
              href="/privacy"
              className="text-[13px] text-muted no-underline transition-ui hover:text-body"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-[13px] text-muted no-underline transition-ui hover:text-body"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
