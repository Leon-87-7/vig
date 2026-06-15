'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobSummary } from '@/components/job-card';

export interface FeedStats {
  total: number;
  by_status: Record<string, number>;
  by_content_type: Record<string, number>;
}

interface JobsResponse {
  items: JobSummary[];
  total: number;
}

async function fetchFeed(
  ct: string,
  st: string,
): Promise<{ stats: FeedStats; jobs: JobSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (ct) params.set('content_type', ct);
  if (st) params.set('status', st);
  params.set('limit', '50');
  const [statsRes, jobsRes] = await Promise.all([
    fetch('/api/jobs/stats'),
    fetch(`/api/jobs?${params}`),
  ]);
  if (!statsRes.ok) throw new Error('Failed to load stats');
  if (!jobsRes.ok) throw new Error('Failed to load jobs');
  const [stats, jobsData] = await Promise.all([
    statsRes.json() as Promise<FeedStats>,
    jobsRes.json() as Promise<JobsResponse>,
  ]);
  return { stats, jobs: jobsData.items, total: jobsData.total };
}

export function useFeedData(initialContentType = '') {
  const [ctFilter, setCtFilter] = useState(initialContentType);
  const [stFilter, setStFilter] = useState('');
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request-id counter. Every dispatch (load + reload) increments
  // this before the await; after the await, the response is discarded unless
  // the captured id still matches the latest.
  const reqIdRef = useRef(0);

  const load = useCallback(async (ct: string, st: string) => {
    const reqId = ++reqIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const { stats, jobs, total } = await fetchFeed(ct, st);

      // Discard if a newer request has been dispatched while we were awaiting.
      if (reqId !== reqIdRef.current) return;

      // Defensive: drop items whose content_type doesn't match the filter that
      // was active when this request was dispatched. This catches server-side
      // bugs and further neutralises any residual race at the item level.
      const filtered = ct ? jobs.filter((j) => j.content_type === ct) : jobs;

      setStats(stats);
      setJobs(filtered);
      setTotal(total);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      // Only clear loading for the latest request to avoid a flicker where a
      // stale response sets loading=false before the current one finishes.
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const ctRef = useRef(ctFilter);
  ctRef.current = ctFilter;
  const stRef = useRef(stFilter);
  stRef.current = stFilter;

  const reload = useCallback(async () => {
    // Background poll: increment the req-id so a concurrent load() dispatched
    // after this poll does not get clobbered by a slow poll response.
    const reqId = ++reqIdRef.current;

    try {
      const { stats, jobs, total } = await fetchFeed(ctRef.current, stRef.current);

      if (reqId !== reqIdRef.current) return;

      const ct = ctRef.current;
      const filtered = ct ? jobs.filter((j) => j.content_type === ct) : jobs;

      setStats(stats);
      setJobs(filtered);
      setTotal(total);
    } catch {
      // swallow during background polling
    }
  }, []);

  useEffect(() => {
    setJobs([]);        // clear synchronously on filter change so stale-type cards don't linger
    load(ctFilter, stFilter);
  }, [ctFilter, stFilter, load]);

  return {
    ctFilter,
    setCtFilter,
    stFilter,
    setStFilter,
    stats,
    jobs,
    total,
    loading,
    error,
    reload,
  };
}
