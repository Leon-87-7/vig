'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

// FastAPI puts the reason in `detail` (a string, or {field, message} for our
// 400/422s). Surface it instead of a generic "failed" so real causes are visible.
async function errorMessage(r: Response, fallback: string): Promise<string> {
  try {
    const d = await r.json();
    const detail = d?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return detail.message;
  } catch { /* non-JSON (e.g. a 500 HTML page) — fall through */ }
  return `${fallback} (${r.status})`;
}

// onUploaded receives the accepted job's id (null if the API omitted it) so
// callers can route to its detail page; the doc-parser page ignores the arg.
export function DocUploadPanel({
  onUploaded,
  flat = false,
}: {
  onUploaded: (jobId: string | null) => void;
  flat?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [compact, setCompact] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (busy) return;
    setError('');
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/parsed/upload', { method: 'POST', body: fd });
      if (!r.ok) { setError(await errorMessage(r, 'Upload failed')); return; }
      onUploaded((await r.json())?.job_id ?? null);
    } finally {
      setBusy(false);
    }
  }
  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const r = await fetch('/api/parsed/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      if (!r.ok) { setError(await errorMessage(r, 'URL upload failed')); return; }
      setUrl('');
      onUploaded((await r.json())?.job_id ?? null);
    } finally {
      setBusy(false);
    }
  }

  // flat: no card chrome and no mobile collapse — it lives inside a dialog.
  const Wrapper = flat ? 'div' : 'section';
  return (
    <Wrapper className={flat ? 'mt-4' : `${compact ? 'max-lg:max-h-12 max-lg:overflow-hidden' : ''} rounded-lg border border-line bg-surface p-4`}>
      {!flat && <button onClick={() => setCompact(!compact)} className="mb-3 w-full text-left text-sm font-medium text-ink lg:hidden">Upload documents</button>}
      <form onSubmit={submitUrl} className="flex gap-2">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/file.pdf" className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink" />
        <button disabled={busy} className="rounded-md bg-signal px-4 text-sm text-onsignal disabled:opacity-50">Fetch</button>
      </form>
      <button
        type="button"
        disabled={busy}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
        onClick={() => fileRef.current?.click()}
        className="mt-4 flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-canvas text-body transition-ui hover:border-signal hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload />
        <span>Drop a PDF here or click to choose</span>
        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
      </button>
      {error && <p className="mt-2 text-sm text-status-error">{error}</p>}
    </Wrapper>
  );
}
