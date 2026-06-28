'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, ExternalLink } from 'lucide-react';
import { BrainGraph } from '@/components/brain-graph';
import { SegmentedTabs } from '@/components/filter-bar';
import { useSemanticSearch } from '@/lib/hooks/useSemanticSearch';
import type { BrainResult } from '@/lib/hooks/useSemanticSearch';
import { PageShell, PageHeader } from '@/components/page-shell';

type BrainTab = 'search' | 'links';

type LinkRow = {
  url: string;
  title?: string | null;
  topic?: string | null;
  seen_count: number;
  first_seen: string;
  last_seen?: string | null;
};

type LinksResponse = {
  items: LinkRow[];
  limit: number;
  offset: number;
  total: number;
};

const LINKS_PAGE_SIZE = 25;

function IdleBanner() {
  return (
    <div className="rounded-lg border border-line bg-surface px-6 py-12 text-center">
      <p className="text-lg font-medium text-ink">
        Search your Second Brain
      </p>
      <p className="mt-1 text-pretty text-sm text-body">
        Type a query above to find semantically similar videos and
        articles you have saved.
      </p>
    </div>
  );
}

function EmptyBanner() {
  return (
    <p className="text-pretty rounded-lg border border-line bg-surface px-6 py-8 text-center text-sm text-body">
      No results found. Try a different query or add more videos to
      your Brain.
    </p>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-line bg-status-error-tint px-4 py-3 text-sm text-status-error">
      {message}
    </p>
  );
}

function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

function ResultRow({ result }: { result: BrainResult }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{result.title}</span>
        {result.topic && (
          <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-body">
            {result.topic}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-xs text-muted">
          {result.score.toFixed(4)}
        </span>
      </div>
      {safeUrl(result.url) ? (
        <a
          href={safeUrl(result.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-full truncate font-mono text-xs text-body transition-ui hover:text-signal hover:underline"
        >
          {result.url}
        </a>
      ) : (
        <span className="block max-w-full truncate font-mono text-xs text-muted">
          {result.url}
        </span>
      )}
    </li>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function LinksTable() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [data, setData] = useState<LinksResponse>({
    items: [],
    limit: LINKS_PAGE_SIZE,
    offset: 0,
    total: 0,
  });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  // Debounce only the search box; page navigation should load immediately.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState('loading');
      setMessage('');
      const params = new URLSearchParams({
        limit: String(LINKS_PAGE_SIZE),
        offset: String(page * LINKS_PAGE_SIZE),
      });
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
      try {
        const res = await fetch(`/api/brain/links?${params}`);
        if (!res.ok) throw new Error(`Links request failed (${res.status})`);
        const payload = (await res.json()) as LinksResponse;
        if (!cancelled) {
          setData(payload);
          setState('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setState('error');
          setMessage(err instanceof Error ? err.message : 'Unable to load links.');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedQuery]);

  const start = data.total === 0 ? 0 : data.offset + 1;
  const end = Math.min(data.offset + data.items.length, data.total);
  const hasPrevious = data.offset > 0;
  const hasNext = data.offset + data.limit < data.total;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Extracted links</h2>
          <p className="mt-1 text-pretty text-sm text-body">
            Deduplicated canonical URLs discovered by enrichment runs, newest first.
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-muted">
          {state === 'loading' ? 'Loading…' : `${start}-${end} of ${data.total}`}
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
        placeholder="Filter links by URL, title, or topic…"
        aria-label="Filter extracted links"
        className="h-9 w-full rounded-md border border-line bg-canvas px-4 text-sm text-ink placeholder-muted transition-ui hover:border-line-strong focus:border-signal focus:outline-none"
      />

      {state === 'error' && <ErrorBanner message={message} />}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_0_rgba(255,255,255,0.03)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-raised/70 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">URL</th>
                <th scope="col" className="px-4 py-3 font-medium">Last seen</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Appearances</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state === 'loading' && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-body">
                    Loading extracted links…
                  </td>
                </tr>
              )}
              {state === 'ready' && data.items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-body">
                    {query.trim()
                      ? 'No links match your search.'
                      : 'No extracted links have been saved yet.'}
                  </td>
                </tr>
              )}
              {state === 'ready' && data.items.map((link) => {
                const href = safeUrl(link.url);
                return (
                  <tr key={link.url} className="transition-colors hover:bg-raised/60">
                    <td className="max-w-[36rem] px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-full items-center gap-2 font-mono text-xs text-ink transition-ui hover:text-signal hover:underline"
                          >
                            <span className="truncate">{link.url}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted transition-ui group-hover:text-signal" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="block truncate font-mono text-xs text-muted">{link.url}</span>
                        )}
                        {(link.title || link.topic) && (
                          <span className="text-xs text-body">
                            {[link.title, link.topic].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-body">
                      {formatDate(link.last_seen ?? link.first_seen)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-ink">
                      {link.seen_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={!hasPrevious || state === 'loading'}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-ui hover:bg-raised active:scale-[0.96] disabled:text-muted disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!hasNext || state === 'loading'}
          onClick={() => setPage((value) => value + 1)}
          className="h-9 rounded-md bg-signal px-3 text-[13px] font-medium text-onsignal transition-ui hover:bg-signal-bright active:scale-[0.96] disabled:bg-surface disabled:text-muted"
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default function BrainPage() {
  const {
    query,
    setQuery,
    results,
    searchState,
    errorMessage,
    runSearch,
  } = useSemanticSearch();
  const [blankWarning, setBlankWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<BrainTab>('search');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRun = () => {
    if (!query.trim()) {
      setBlankWarning(true);
      inputRef.current?.focus();
      return;
    }
    setBlankWarning(false);
    runSearch();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') handleRun();
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setQuery(e.target.value);
    if (blankWarning && e.target.value.trim()) setBlankWarning(false);
  };

  const loading = searchState === 'loading';

  return (
    <PageShell>
      <PageHeader
        icon={Brain}
        title="Brain"
        description="Semantic search across everything saved to your Second Brain."
      />

      <SegmentedTabs
        label="Brain sections"
        value={activeTab}
        onChange={(v) => setActiveTab(v as BrainTab)}
        tabs={[
          { label: 'Search', value: 'search' },
          { label: 'Links', value: 'links', dividerBefore: true },
        ]}
      />

      {activeTab === 'search' && (
        <>
          <section className="flex gap-2">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="e.g. machine learning, startup advice…"
              aria-label="Semantic search query"
              className="h-9 flex-1 rounded-md border border-line bg-canvas px-4 text-sm text-ink placeholder-muted transition-ui hover:border-line-strong focus:border-signal focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleRun}
              disabled={loading}
              aria-label="Run search"
              className="h-9 rounded-md bg-signal px-4 text-[13px] font-medium text-onsignal transition-ui hover:bg-signal-bright active:bg-signal-deep disabled:bg-surface disabled:text-muted"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-ink"
                  />
                  Searching…
                </span>
              ) : (
                'Search'
              )}
            </button>
          </section>

          {blankWarning && (
            <p className="text-xs text-status-pending">
              Please enter a search query.
            </p>
          )}

          <BrainGraph
            results={results}
            searchState={searchState}
          />

          {searchState === 'idle' && <IdleBanner />}
          {searchState === 'error' && (
            <ErrorBanner message={errorMessage} />
          )}
          {searchState === 'empty' && <EmptyBanner />}
          {searchState === 'results' && (
            <section>
              <p className="mb-2 font-mono text-xs text-muted">
                {results.length} result{results.length === 1 ? '' : 's'}
              </p>
              <ul className="space-y-2">
                {results.map((r) => (
                  <ResultRow
                    key={r.url}
                    result={r}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {activeTab === 'links' && <LinksTable />}
    </PageShell>
  );
}
