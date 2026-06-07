'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/fetch-utils';
import type { FetchState } from '@/lib/fetch-utils';

export interface JobDetail {
  id: string;
  url: string;
  content_type: string;
  status: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error_msg: string | null;
  drive_url: string | null;
  ai_topic: string | null;
  ai_objective: string | null;
  ai_action_points: string | null;
  ai_tools: string | null;
  ai_market_data: string | null;
  promise_gap: string | null;
  template: string | null;
  template_analysis: string | null;
}

export function useJobDetail(jobId: string) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  useEffect(() => {
    const controller = new AbortController();

    fetchJson<JobDetail>(`/api/jobs/${jobId}`, { signal: controller.signal })
      .then((result) => {
        if (!result.ok) { setFetchState(result.state); return; }
        setJob(result.data);
        setFetchState('ok');
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setFetchState('error');
      });

    return () => controller.abort();
  }, [jobId]);

  return { job, fetchState };
}
