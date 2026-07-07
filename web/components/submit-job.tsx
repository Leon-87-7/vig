'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { FormEvent, ReactNode } from 'react';
import { SubmitUrlForm } from '@/components/submit-url-form';
import { Brain, FileCode2, Link2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

/** The job the API accepted, timestamped so consumers can react to repeats. */
export interface AcceptedJob {
  id: string | null;
  url: string;
  title: string | null;
  content_type: string;
  status: string;
  at: number;
}

interface SubmitJobContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDocs: () => void;
  openCommand: () => void;
  lastAccepted: AcceptedJob | null;
}

const SubmitJobContext = createContext<SubmitJobContextValue | null>(
  null,
);

function hasActiveDialog() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some(
    (dialog) =>
      dialog.getAttribute('aria-hidden') !== 'true' &&
      dialog.dataset.state !== 'closed',
  );
}

function shouldIgnoreGlobalShortcut(target: EventTarget | null) {
  if (hasActiveDialog()) return true;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    Boolean(target.closest('[role="dialog"]'))
  );
}

function inferContentTypeFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();

    if (host === 'github.com') return 'repo';
    if (host.endsWith('youtube.com') && path === '/watch') return 'long';
    if (host === 'youtu.be') return 'long';
    if (host.endsWith('youtube.com') && path.startsWith('/shorts/')) return 'short';
    if (host.endsWith('instagram.com') && path.startsWith('/reel/')) return 'short';
    if (host.endsWith('tiktok.com') && path.includes('/video/')) return 'short';
  } catch {
    return 'article';
  }

  return 'article';
}

export function useSubmitJob(): SubmitJobContextValue {
  const ctx = useContext(SubmitJobContext);
  if (!ctx)
    throw new Error(
      'useSubmitJob must be used within SubmitJobProvider',
    );
  return ctx;
}


function CommandAction({
  icon: Icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: typeof Plus;
  label: string;
  shortcut: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-ink transition-ui hover:bg-raised focus:outline-none focus:ring-1 focus:ring-signal"
    >
      <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
      <span>{label}</span>
      <kbd className="ml-auto rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
        {shortcut}
      </kbd>
    </button>
  );
}

/**
 * Owns the one Submit URL dialog for the whole dashboard. Triggers anywhere
 * (global header on sm+, the Feed's tabs-row button below sm) call setOpen;
 * pages that care about the outcome (Feed's optimistic rows) watch
 * lastAccepted instead of owning the mutation themselves.
 */
export function SubmitJobProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [template, setTemplate] = useState('summary');
  const [freestylePrompt, setFreestylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastAccepted, setLastAccepted] =
    useState<AcceptedJob | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        key === 'n' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !shouldIgnoreGlobalShortcut(event.target)
      ) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (
        key === 'd' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !shouldIgnoreGlobalShortcut(event.target)
      ) {
        event.preventDefault();
        setDocsOpen(true);
        return;
      }
      if (
        key === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !shouldIgnoreGlobalShortcut(event.target)
      ) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submitJob = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = url.trim();
      if (!trimmed || submitting) return;
      setError(null);

      if (template === 'freestyle' && !freestylePrompt.trim()) {
        setError('Freestyle prompt cannot be empty');
        return;
      }

      setSubmitting(true);
      try {
        const payload: Record<string, string> = {
          url: trimmed,
          template,
        };
        if (template === 'freestyle')
          payload.freestyle_prompt = freestylePrompt.trim();
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data.detail || 'Could not submit job');
        setLastAccepted({
          id:
            typeof data.id === 'string' && data.id ? data.id : null,
          url: trimmed,
          title: typeof data.title === 'string' ? data.title : null,
          content_type:
            typeof data.content_type === 'string'
              ? data.content_type
              : inferContentTypeFromUrl(trimmed),
          status:
            typeof data.status === 'string' ? data.status : 'pending',
          at: Date.now(),
        });
        setUrl('');
        setFreestylePrompt('');
        setOpen(false);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not submit job',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [freestylePrompt, submitting, template, url],
  );

  const openDocs = useCallback(() => setDocsOpen(true), []);
  const openCommand = useCallback(() => setCommandOpen(true), []);
  const go = useCallback((href: string) => {
    setCommandOpen(false);
    setDocsOpen(false);
    window.location.assign(href);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, openDocs, openCommand, lastAccepted }),
    [open, openDocs, openCommand, lastAccepted],
  );

  return (
    <SubmitJobContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent>
          <DialogTitle>Submit URL</DialogTitle>
          <div className="mt-4">
            <SubmitUrlForm
              url={url}
              onUrlChange={setUrl}
              template={template}
              onTemplateChange={setTemplate}
              freestylePrompt={freestylePrompt}
              onFreestylePromptChange={setFreestylePrompt}
              submitting={submitting}
              error={error}
              onSubmit={submitJob}
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={docsOpen}
        onOpenChange={setDocsOpen}
      >
        <DialogContent>
          <DialogTitle>Ingest Docs</DialogTitle>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-body">
              Start a document parse from the dedicated Doc Parser workflow.
              Feed owns discovery; Doc Parser remains the processing and detail surface.
            </p>
            <button
              type="button"
              onClick={() => go('/doc-parser')}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-signal px-3.5 text-[13px] font-medium text-onsignal transition-ui hover:bg-signal-bright active:bg-signal-deep"
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              Open Doc Parser
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
      >
        <DialogContent>
          <DialogTitle>Command launcher</DialogTitle>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-muted">Intake</p>
              <div className="space-y-1">
                <CommandAction icon={Plus} label="Submit URL" shortcut="N" onSelect={() => { setCommandOpen(false); setOpen(true); }} />
                <CommandAction icon={FileCode2} label="Ingest Docs" shortcut="D" onSelect={() => { setCommandOpen(false); setDocsOpen(true); }} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-muted">Navigate</p>
              <div className="space-y-1">
                <CommandAction icon={Link2} label="Open Links" shortcut="Feed" onSelect={() => go('/?view=links')} />
                <CommandAction icon={Brain} label="Open Brain" shortcut="Brain" onSelect={() => go('/brain')} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SubmitJobContext.Provider>
  );
}
