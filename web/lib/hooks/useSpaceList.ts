'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SpaceSummary } from '@/components/SpaceCard';

export function useSpaceList() {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/spaces');
      if (!res.ok) throw new Error('Failed to load spaces');
      const data: SpaceSummary[] = await res.json();
      setSpaces(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { spaces, loading, error, reload };
}
