'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/fetch-utils';
import type { FetchState } from '@/lib/fetch-utils';

export interface SpaceDetail {
  id: string;
  chat_id: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export function useSpaceDetail(spaceId: string) {
  const [space, setSpace] = useState<SpaceDetail | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  useEffect(() => {
    const controller = new AbortController();

    fetchJson<SpaceDetail>(`/api/spaces/${spaceId}`, { signal: controller.signal })
      .then((result) => {
        if (!result.ok) { setFetchState(result.state); return; }
        setSpace(result.data);
        setFetchState('ok');
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setFetchState('error');
      });

    return () => controller.abort();
  }, [spaceId]);

  return { space, setSpace, fetchState };
}
