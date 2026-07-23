'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, ScanText, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** How long each step holds before auto-advancing. Interactive-first: any hover,
 * focus, or click pauses it, so readers are never rushed; non-clickers still get
 * the whole loop. Disabled entirely under prefers-reduced-motion. */
const DWELL_MS = 5000;

type Step = {
  key: string;
  tag: string;
  icon: LucideIcon;
  title: string;
  body: string;
  fact: string;
  factAccent: string;
};

const STEPS: readonly Step[] = [
  {
    key: 'share',
    tag: 'SHARE',
    icon: Share2,
    title: 'Share it, keep scrolling',
    body: "Hit your phone's share sheet — from Instagram, YouTube, TikTok, GitHub, a PDF — and aim it at the Ownix bot. That's the whole action on your end.",
    fact: '11:32  shared  ◉  reel · article · repo · pdf',
    factAccent: 'text-body',
  },
  {
    key: 'read',
    tag: 'AI PASS',
    icon: ScanText,
    title: 'Ownix does the reading',
    body: 'A minute later it is transcribed, summarized, and every link pulled out — one AI pass over the whole thing. The engine is swappable; nothing is locked to a vendor.',
    fact: '11:32  transcribing → summarizing → linking',
    factAccent: 'text-status-processing',
  },
  {
    key: 'own',
    tag: 'OWN IT',
    icon: FileText,
    title: 'It lands in your Index — yours',
    body: 'Searchable, agent-ready markdown in your Feed and your own Google Drive. Paste a segment into your AI, or find it later from just a glimpse.',
    fact: '11:33  landed in Feed  ◉  .md in Drive',
    factAccent: 'text-status-done',
  },
];

const LAST = STEPS.length - 1;

export function OnboardingStepper() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // Pre-hydration and no-JS visitors see every step at once (the full story);
  // once mounted this collapses into the interactive stepper. Mirrors CountUp:
  // the enhancement only ever plays on top of a complete default.
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (!mounted || paused || reduced) return;
    const t = setTimeout(() => setActive((a) => (a === LAST ? 0 : a + 1)), DWELL_MS);
    return () => clearTimeout(t);
  }, [active, paused, mounted, reduced]);

  function select(next: number) {
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    let next: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = active === LAST ? 0 : active + 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = active === 0 ? LAST : active - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = LAST;
    if (next !== null) {
      e.preventDefault();
      select(next);
    }
  }

  return (
    <section
      id="onboarding"
      aria-labelledby="onboarding-h"
      className="scroll-mt-16 border-t border-line py-16"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mx-auto max-w-[960px] px-6">
        <span className="mb-2 block font-mono text-[11px] font-medium tracking-[0.4px] text-contrasignal">
          THE LOOP
        </span>
        <h2
          id="onboarding-h"
          className="text-pretty mb-3 max-w-[18ch] text-[clamp(22px,3.4vw,28px)] font-semibold leading-tight tracking-[-0.25px] text-ink"
        >
          One share, start to finish.
        </h2>
        <p className="text-pretty mb-8 max-w-[58ch] text-[15px] leading-relaxed">
          The entire product is three moves. You do the first one; Ownix does the rest.
        </p>

        <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8">
          {/* Step rail */}
          <div
            role="tablist"
            aria-label="How Ownix works, step by step"
            aria-orientation="vertical"
            className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
          >
            {STEPS.map((step, i) => {
              const selected = i === active;
              return (
                <button
                  key={step.key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`onboarding-tab-${step.key}`}
                  aria-selected={selected}
                  aria-controls={`onboarding-panel-${step.key}`}
                  tabIndex={mounted && !selected ? -1 : 0}
                  onClick={() => setActive(i)}
                  onKeyDown={onKeyDown}
                  className={`group flex min-w-[9rem] flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-ui md:min-w-0 ${
                    selected
                      ? 'border-contrasignal/60 bg-raised'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-raised'
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[11px] font-medium transition-ui ${
                      selected
                        ? 'border-contrasignal/60 text-contrasignal'
                        : 'border-line text-muted group-hover:text-body'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block font-mono text-[11px] font-medium tracking-[0.4px] transition-ui ${
                        selected ? 'text-contrasignal' : 'text-muted'
                      }`}
                    >
                      {step.tag}
                    </span>
                    <span
                      className={`hidden truncate text-[13px] font-medium transition-ui md:block ${
                        selected ? 'text-ink' : 'text-body'
                      }`}
                    >
                      {step.title}
                    </span>
                  </span>
                </button>
              );
            })}
            {/* Auto-advance progress. Skipped under reduced motion (no auto-advance
                to visualize) and pre-hydration (all panels shown, no active step). */}
            {mounted && !reduced && (
              <div
                aria-hidden="true"
                className="mt-1 hidden h-[2px] overflow-hidden rounded-full bg-line md:block"
              >
                <span
                  key={active}
                  className="block h-full origin-left bg-contrasignal/70"
                  style={{
                    animation: `onboarding-fill ${DWELL_MS}ms linear`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              </div>
            )}
          </div>

          {/* Panels */}
          <div>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.key}
                  role="tabpanel"
                  id={`onboarding-panel-${step.key}`}
                  aria-labelledby={`onboarding-tab-${step.key}`}
                  tabIndex={0}
                  hidden={mounted && i !== active}
                  className="rounded-lg border border-line bg-surface p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-signal md:p-6 [&:not([hidden])+[role=tabpanel]]:mt-3"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-contrasignal">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="mb-1 text-[16px] font-semibold leading-snug text-ink md:text-[18px]">
                        {step.title}
                      </h3>
                      <p className="text-pretty max-w-[52ch] text-[14px] leading-relaxed text-body">
                        {step.body}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`mt-4 border-t border-line pt-3 font-mono text-[11px] leading-normal tracking-[0.3px] ${step.factAccent}`}
                  >
                    {step.fact}
                  </p>
                </div>
              );
            })}

            {/* Controls — sequential nav that mirrors the auto-advance, plus a
                soft hand-off to the invite CTA once the loop is understood. */}
            {mounted && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => select(active === 0 ? LAST : active - 1)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-body transition-ui hover:bg-raised hover:text-ink"
                >
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  Back
                </button>
                {active === LAST ? (
                  <a
                    href="#invite"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line border-b-2 border-b-contrasignal-deep bg-transparent px-3.5 text-[13px] font-medium text-ink transition-ui hover:bg-raised"
                  >
                    Get an invite
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => select(active + 1)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-body transition-ui hover:bg-raised hover:text-ink"
                  >
                    Next
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
                <span className="ml-auto font-mono text-[11px] text-muted" aria-hidden="true">
                  {String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
