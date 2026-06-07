'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSpaceUrls } from '@/lib/hooks/useSpaceUrls';

const CONTENT_TYPE_COLORS: Record<string, string> = {
  short: 'bg-purple-900 text-purple-200',
  long: 'bg-blue-900 text-blue-200',
  article: 'bg-teal-900 text-teal-200',
  repo: 'bg-orange-900 text-orange-200',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export function UrlsTab({ spaceId }: { spaceId: string }) {
  const { spaceUrls, allJobs, loading, addJob, removeUrl, reorderUrl } = useSpaceUrls(spaceId);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [addingJob, setAddingJob] = useState(false);

  const pinnedIds = new Set(spaceUrls.map((u) => u.id));
  const availableJobs = allJobs.filter((j) => !pinnedIds.has(j.id));

  const handleAddJob = async () => {
    if (!selectedJobId) return;
    setAddingJob(true);
    try {
      await addJob(selectedJobId);
      setSelectedJobId('');
    } finally {
      setAddingJob(false);
    }
  };

  return (
    <section className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-600 border-t-white" />
          Loading…
        </div>
      ) : spaceUrls.length === 0 ? (
        <p className="text-sm text-gray-500">No jobs added yet.</p>
      ) : (
        <ul className="space-y-2">
          {spaceUrls.map((item, idx) => {
            const display = item.title?.trim() || item.url;
            const ctColor = CONTENT_TYPE_COLORS[item.content_type] ?? 'bg-gray-700 text-gray-300';
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-lg bg-gray-800 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => reorderUrl(idx, 'up')}
                    disabled={idx === 0}
                    className="rounded px-1 py-0.5 text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                    aria-label="Move up"
                  >&#9650;</button>
                  <button
                    onClick={() => reorderUrl(idx, 'down')}
                    disabled={idx === spaceUrls.length - 1}
                    className="rounded px-1 py-0.5 text-xs text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                    aria-label="Move down"
                  >&#9660;</button>
                </div>
                <Link
                  href={`/jobs/${item.id}`}
                  className="flex-1 min-w-0 text-sm text-gray-100 hover:text-white truncate"
                  title={display}
                >
                  {display}
                </Link>
                <Badge label={item.content_type} colorClass={ctColor} />
                <button
                  onClick={() => removeUrl(item.id)}
                  className="ml-1 rounded border border-red-700 px-2 py-0.5 text-xs text-red-400 hover:border-red-500 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3 pt-2">
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Select a job to add…</option>
          {availableJobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title?.trim() || j.url} ({j.content_type})
            </option>
          ))}
        </select>
        <button
          onClick={handleAddJob}
          disabled={!selectedJobId || addingJob}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {addingJob ? 'Adding…' : 'Add'}
        </button>
      </div>
    </section>
  );
}
