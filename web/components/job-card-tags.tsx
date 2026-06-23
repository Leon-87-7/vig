'use client';

import { TagMenu, TagChips } from '@/components/TagPicker';
import { useJobTags } from '@/lib/hooks/useJobTags';

// Attached tag badges + compact dropdown for a feed card. Eager so existing
// tags show without opening the menu.
// ponytail: N feed cards = N tag fetches. If it bites, fold tags into /api/jobs.
export function JobCardTags({ jobId }: { jobId: string }) {
  const { jobTags, allTags, toggleTag, createTag } = useJobTags(jobId, 'ok');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TagChips jobTags={jobTags} onRemove={(id) => toggleTag(id, true)} />
      <TagMenu jobTags={jobTags} allTags={allTags} onToggle={toggleTag} onCreate={createTag} />
    </div>
  );
}
