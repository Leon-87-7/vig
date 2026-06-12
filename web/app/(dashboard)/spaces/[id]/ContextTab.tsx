'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSpaceContext } from '@/lib/hooks/useSpaceContext';

const MarkdownEditor = dynamic(() => import('@/components/MarkdownEditor'), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-line bg-surface p-4 text-xs text-muted">
      Loading editor…
    </div>
  ),
});

export function ContextTab({ spaceId }: { spaceId: string }) {
  const { blobs, loading, blobError, addBlob, updateBlob, deleteBlob, reorderBlob, patchBlobName } = useSpaceContext(spaceId);
  const [newBlobName, setNewBlobName] = useState('');
  const [addingBlob, setAddingBlob] = useState(false);

  const handleAddBlob = async () => {
    const name = newBlobName.trim() || 'New context';
    setAddingBlob(true);
    try {
      await addBlob(name);
      setNewBlobName('');
    } finally {
      setAddingBlob(false);
    }
  };

  return (
    <section className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-body">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" />
          Loading…
        </div>
      ) : blobs.length === 0 ? (
        <p className="text-sm text-muted">
          No context documents yet. Add one to frame how sources should be read.
        </p>
      ) : (
        <div className="space-y-6">
          {blobs.map((blob, idx) => (
            <div key={blob.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => reorderBlob(idx, 'up')}
                    disabled={idx === 0}
                    className="rounded px-1 py-0.5 text-xs text-muted transition-colors duration-150 ease-out-quart hover:text-ink disabled:opacity-30"
                    aria-label="Move up"
                  >&#9650;</button>
                  <button
                    onClick={() => reorderBlob(idx, 'down')}
                    disabled={idx === blobs.length - 1}
                    className="rounded px-1 py-0.5 text-xs text-muted transition-colors duration-150 ease-out-quart hover:text-ink disabled:opacity-30"
                    aria-label="Move down"
                  >&#9660;</button>
                </div>
                <input
                  type="text"
                  value={blob.name}
                  onChange={(e) => patchBlobName(blob.id, e.target.value)}
                  onBlur={(e) => updateBlob(blob.id, e.target.value, blob.content)}
                  className="flex-1 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink transition-colors duration-150 ease-out-quart hover:border-line-strong focus:border-signal focus:outline-none"
                  placeholder="Context name"
                />
                <button
                  onClick={() => deleteBlob(blob.id)}
                  className="rounded border border-line px-2 py-0.5 text-xs font-medium text-status-error transition-colors duration-150 ease-out-quart hover:bg-raised"
                >
                  Remove
                </button>
              </div>
              <MarkdownEditor
                initialMarkdown={blob.content}
                onSave={(md) => updateBlob(blob.id, blob.name, md)}
              />
            </div>
          ))}
        </div>
      )}

      {blobError && <p className="text-sm text-status-error">{blobError}</p>}

      <div className="flex items-center gap-3 pt-2">
        <input
          type="text"
          value={newBlobName}
          onChange={(e) => setNewBlobName(e.target.value)}
          placeholder="Context document name…"
          className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder-muted transition-colors duration-150 ease-out-quart hover:border-line-strong focus:border-signal focus:outline-none"
        />
        <button
          onClick={handleAddBlob}
          disabled={addingBlob}
          className="h-9 rounded-md bg-signal px-4 text-[13px] font-medium text-onsignal transition-colors duration-150 ease-out-quart hover:bg-signal-bright active:bg-signal-deep disabled:bg-surface disabled:text-muted"
        >
          {addingBlob ? 'Adding…' : 'Add context'}
        </button>
      </div>
    </section>
  );
}
