'use client';

import { useState } from 'react';
import { useTagList } from '@/lib/hooks/useTagList';
import { useDomainList } from '@/lib/hooks/useDomainList';
import type { Tag, TagFormState } from '@/lib/hooks/useTagList';

const DEFAULT_COLOR = '#6366f1';

function ColorSwatch({ color }: { color: string }) {
  return <span className="inline-block h-4 w-4 flex-shrink-0 rounded" style={{ backgroundColor: color }} />;
}

function TagForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: TagFormState;
  onSubmit: (values: TagFormState) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<TagFormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(undefined);
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-body">Name</label>
        <input type="text" required maxLength={80} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="Tag name" className="w-44 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder-muted transition-colors duration-150 ease-out-quart hover:border-line-strong focus:border-signal focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-body">Meaning</label>
        <input type="text" maxLength={500} value={values.meaning} onChange={(e) => setValues((v) => ({ ...v, meaning: e.target.value }))} placeholder="What this tag means..." className="w-72 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder-muted transition-colors duration-150 ease-out-quart hover:border-line-strong focus:border-signal focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-body">Color</label>
        <input type="color" value={values.color} onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))} className="h-9 w-14 cursor-pointer rounded-md border border-line bg-canvas p-1" />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={submitting} className="h-8 rounded-md bg-signal px-3.5 text-[13px] font-medium text-onsignal transition-colors duration-150 ease-out-quart hover:bg-signal-bright active:bg-signal-deep disabled:bg-surface disabled:text-muted">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="h-8 rounded-md px-3.5 text-[13px] font-medium text-muted transition-colors duration-150 ease-out-quart hover:bg-raised hover:text-ink">Cancel</button>}
      </div>
      {localError && <p className="w-full text-xs text-status-error">{localError}</p>}
    </form>
  );
}

function TagRow({
  tag,
  onDelete,
  onUpdate,
}: {
  tag: Tag;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, values: TagFormState) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const handleDelete = async () => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    setDeleteError(undefined);
    try {
      await onDelete(tag.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleUpdate = async (values: TagFormState) => {
    await onUpdate(tag.id, values);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-line bg-surface px-4 py-3">
        <TagForm initial={{ name: tag.name, meaning: tag.meaning, color: tag.color }} onSubmit={handleUpdate} onCancel={() => setEditing(false)} submitLabel="Save" />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <ColorSwatch color={tag.color} />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-ink">{tag.name}</span>
        {tag.meaning && <span className="ml-2 truncate text-sm text-body">{tag.meaning}</span>}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => setEditing(true)} className="rounded px-2 py-1 text-xs font-medium text-muted transition-colors duration-150 ease-out-quart hover:bg-raised hover:text-ink">Edit</button>
        <button onClick={handleDelete} className="rounded px-2 py-1 text-xs font-medium text-status-error transition-colors duration-150 ease-out-quart hover:bg-raised">Delete</button>
      </div>
      {deleteError && <p className="w-full text-xs text-status-error">{deleteError}</p>}
    </li>
  );
}

function TagsTab() {
  const { tags, loading, fetchError, createTag, deleteTag, updateTag } = useTagList();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Create tag</h3>
        <TagForm initial={{ name: '', meaning: '', color: DEFAULT_COLOR }} onSubmit={createTag} submitLabel="Create" />
      </div>
      {loading && <p className="text-sm text-body">Loading tags…</p>}
      {fetchError && <p className="text-sm text-status-error">{fetchError}</p>}
      {!loading && !fetchError && tags.length === 0 && <p className="text-sm text-muted">No tags yet. Create one above.</p>}
      {tags.length > 0 && (
        <ul className="space-y-2">
          {tags.map((tag) => <TagRow key={tag.id} tag={tag} onDelete={deleteTag} onUpdate={updateTag} />)}
        </ul>
      )}
    </div>
  );
}

function DomainTab({ apiPath, label }: { apiPath: string; label: string }) {
  const { domains, loading, fetchError, addDomain, removeDomain } = useDomainList(apiPath, label);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | undefined>();
  const [removeError, setRemoveError] = useState<string | undefined>();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(undefined);
    try {
      await addDomain(trimmed);
      setInput('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domain: string) => {
    setRemoveError(undefined);
    try {
      await removeDomain(domain);
    } catch (err: unknown) {
      setRemoveError(err instanceof Error ? err.message : 'Remove failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Add domain</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="domain-input" className="text-xs font-medium text-body">Domain or URL</label>
            <input id="domain-input" type="text" required value={input} onChange={(e) => setInput(e.target.value)} placeholder="example.com" className="w-72 rounded-md border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder-muted transition-colors duration-150 ease-out-quart hover:border-line-strong focus:border-signal focus:outline-none" />
          </div>
          <button type="submit" disabled={adding} className="h-8 rounded-md bg-signal px-3.5 text-[13px] font-medium text-onsignal transition-colors duration-150 ease-out-quart hover:bg-signal-bright active:bg-signal-deep disabled:bg-surface disabled:text-muted">
            {adding ? 'Adding…' : 'Add'}
          </button>
          {addError && <p className="w-full text-xs text-status-error">{addError}</p>}
        </form>
      </div>

      {loading && <p className="text-sm text-body">Loading {label.toLowerCase()}…</p>}
      {fetchError && <p className="text-sm text-status-error">{fetchError}</p>}
      {removeError && <p className="text-sm text-status-error">{removeError}</p>}
      {!loading && !fetchError && domains.length === 0 && <p className="text-sm text-muted">No {label.toLowerCase()} yet. Add one above.</p>}
      {domains.length > 0 && (
        <ul className="space-y-2">
          {domains.map((domain) => (
            <li key={domain} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="min-w-0 flex-1 font-mono text-sm text-ink">{domain}</span>
              <button onClick={() => handleRemove(domain)} className="rounded px-2 py-1 text-xs font-medium text-status-error transition-colors duration-150 ease-out-quart hover:bg-raised">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = ['Tags', 'Allowed Domains', 'Ignored Domains'] as const;
type Tab = (typeof TABS)[number];

export default function ControlsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Tags');

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Controls</h1>
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out-quart ${activeTab === tab ? 'border-b-2 border-signal text-ink' : 'text-body hover:text-ink'}`}>
            {tab}
          </button>
        ))}
      </div>
      {activeTab === 'Tags' && <TagsTab />}
      {activeTab === 'Allowed Domains' && <DomainTab apiPath="/api/controls/allowed-domains" label="Allowed Domains" />}
      {activeTab === 'Ignored Domains' && <DomainTab apiPath="/api/controls/ignored-domains" label="Ignored Domains" />}
    </div>
  );
}
