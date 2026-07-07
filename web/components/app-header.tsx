'use client';

import { Plus } from 'lucide-react';
import { useSubmitJob } from '@/components/submit-job';

/**
 * The global sticky brand bar — pinned to the top of the scroll area on every
 * dashboard page and every viewport. Below sm the brand block centers and the
 * Submit URL trigger disappears (mobile submits from the Feed's tabs row);
 * sm+ keeps the Feed header's original left-aligned layout.
 */
export function AppHeader() {
  const { setOpen, openCommand } = useSubmitJob();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-start">
        <span className="text-5xl font-semibold leading-none tracking-tight text-ink">
          VIG
        </span>
        <div
          aria-hidden="true"
          className="my-1 hidden w-px self-stretch bg-line-strong sm:block"
        />
        {/* Two voices: Inter italic motto over the machine's mono echo, each
            Latin word column-aligned above its English state. */}
        <div className="grid grid-cols-[repeat(3,auto)] gap-x-6 gap-y-1.5">
          <span className="text-sm font-medium italic text-body">
            Servavi.
          </span>
          <span className="text-sm font-medium italic text-body">
            Ditavi.
          </span>
          <span className="text-sm font-medium italic text-body">
            Inveni.
          </span>
          <span className="font-mono text-[11px] tracking-wide text-contrasignal-bright">
            Saved.
          </span>
          <span className="font-mono text-[11px] tracking-wide text-contrasignal-bright">
            Enriched.
          </span>
          <span className="font-mono text-[11px] tracking-wide text-contrasignal-bright">
            Found.
          </span>
        </div>

        <button
          type="button"
          onClick={openCommand}
          aria-label="Open command launcher"
          className="ml-auto hidden h-9 items-center gap-2 rounded-md border border-line border-b-2 border-b-signal bg-surface px-3 text-sm font-medium text-body transition-ui hover:text-ink active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:inline-flex motion-reduce:active:scale-100"
        >
          <span>Commands</span>
          <kbd className="ml-2 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-contrasignal-deep hover:text-contrasignal-bright">
            ⌘ K
          </kbd>
        </button>
      </div>
    </header>
  );
}
