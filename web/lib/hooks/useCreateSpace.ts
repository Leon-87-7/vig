'use client';

import { useCallback, useState } from 'react';

export function useCreateSpace(onCreated: () => Promise<void>) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (res.status === 409) { setFormError('A space with that name already exists.'); return; }
      if (!res.ok) throw new Error('Failed to create space');
      setNewName('');
      setNewColor('#6366f1');
      setShowForm(false);
      await onCreated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [newName, newColor, onCreated]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setFormError(null);
    setNewName('');
    setNewColor('#6366f1');
  }, []);

  return { showForm, setShowForm, newName, setNewName, newColor, setNewColor, submitting, formError, handleCreate, resetForm };
}
