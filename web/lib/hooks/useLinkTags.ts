'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TagFormState } from '@/lib/hooks/useTagList';

export interface TagSummary {
  id: string;
  name: string;
  color: string;
  meaning: string;
  icon?: string | null;
}

const asTags = (d: unknown): TagSummary[] => (Array.isArray(d) ? d : []);

export function useLinkTags(linkId: string, initialTags: TagSummary[] = []) {
  const [linkTags, setLinkTags] = useState<TagSummary[]>(initialTags);
  const [allTags, setAllTags] = useState<TagSummary[]>([]);

  const refetchTags = useCallback(() => {
    fetch(`/api/brain/links/${linkId}/tags`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLinkTags(asTags(d)))
      .catch(() => {});
  }, [linkId]);

  const refetchAll = useCallback(() => {
    fetch('/api/controls/tags', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAllTags(asTags(d)))
      .catch(() => {});
  }, []);

  // Vocabulary loads once per mount; linkTags seeds from useState(initialTags)
  // above. Never sync on initialTags identity — `link.tags ?? []` makes a fresh
  // array per render, which would loop setState forever.
  // ponytail: N rows = N vocabulary fetches (same trade-off as job cards);
  // fold into the links payload if it bites.
  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  const toggleTag = useCallback(async (tagId: string, attached: boolean) => {
    const res = await fetch(`/api/brain/links/${linkId}/tags/${tagId}`, {
      method: attached ? 'DELETE' : 'POST',
      credentials: 'include',
    });
    if (res.ok) refetchTags();
  }, [linkId, refetchTags]);

  const createTag = useCallback(async (values: TagFormState) => {
    const res = await fetch('/api/controls/tags', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error(res.status === 409 ? 'Tag name already exists' : 'Create failed');
    const tag = (await res.json()) as TagSummary;
    const attach = await fetch(`/api/brain/links/${linkId}/tags/${tag.id}`, { method: 'POST', credentials: 'include' });
    if (!attach.ok) throw new Error('Tag created but could not be attached to this link');
    refetchAll();
    refetchTags();
  }, [linkId, refetchAll, refetchTags]);

  return { linkTags, allTags, toggleTag, createTag };
}
