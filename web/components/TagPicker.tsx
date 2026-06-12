'use client'

interface TagSummary {
  id: string
  name: string
  color: string
  meaning: string
}

interface TagPickerProps {
  jobId: string
  jobTags: TagSummary[]
  allTags: TagSummary[]
  onTagChange: () => void
}

/**
 * Renders attached tags as removable colored chips and a select dropdown
 * for attaching additional tags from the user's tag library.
 */
export default function TagPicker({ jobId, jobTags, allTags, onTagChange }: TagPickerProps) {
  const attachedIds = new Set(jobTags.map((t) => t.id))
  const unattached = allTags.filter((t) => !attachedIds.has(t.id))

  async function handleAttach(tagId: string) {
    if (!tagId) return
    const res = await fetch(`/api/jobs/${jobId}/tags/${tagId}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (res.ok || res.status === 201) onTagChange()
  }

  async function handleDetach(tagId: string) {
    const res = await fetch(`/api/jobs/${jobId}/tags/${tagId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (res.ok || res.status === 204) onTagChange()
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <span className="mb-3 block font-mono text-[11px] font-medium uppercase tracking-wider text-muted">
        Tags
      </span>

      {/* Attached tag chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {jobTags.length === 0 && (
          <span className="text-xs text-muted">No tags attached.</span>
        )}
        {jobTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-xs font-medium text-ink"
            title={tag.meaning || undefined}
          >
            {/* Color dot */}
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
            <button
              onClick={() => handleDetach(tag.id)}
              className="ml-0.5 rounded-full text-muted transition-ui hover:text-ink focus:outline-none"
              aria-label={`Remove tag ${tag.name}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Add tag dropdown */}
      {unattached.length > 0 && (
        <select
          className="rounded-md border border-line bg-canvas px-2 py-1 text-xs text-body focus:border-signal focus:outline-none"
          value=""
          onChange={(e) => handleAttach(e.target.value)}
        >
          <option value="" disabled>
            Add tag…
          </option>
          {unattached.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
