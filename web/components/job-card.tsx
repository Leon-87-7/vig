import Link from "next/link";

export interface JobSummary {
  id: string;
  title?: string | null;
  url: string;
  content_type: string;
  status: string;
  created_at: string;
}

// The Two-Dialect Badge Rule (DESIGN.md): content types are OUTLINED
// (transparent + hairline + hue text), statuses are FILLED (tint + hue text).
const CONTENT_TYPE_COLORS: Record<string, string> = {
  short: "text-type-short",
  long: "text-type-long",
  article: "text-type-article",
  repo: "text-type-repo",
};

const STATUS_COLORS: Record<string, string> = {
  done: "bg-status-done-tint text-status-done",
  pending: "bg-status-pending-tint text-status-pending",
  processing: "bg-status-processing-tint text-status-processing",
  enriching: "bg-status-enriching-tint text-status-enriching",
  transcript_done: "bg-status-enriching-tint text-status-enriching",
  error: "bg-status-error-tint text-status-error",
  cancelled: "bg-status-cancelled-tint text-status-cancelled",
};

function TypeBadge({ label }: { label: string }) {
  const hue = CONTENT_TYPE_COLORS[label] ?? "text-body";
  return (
    <span
      className={`inline-block rounded border border-line px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wider ${hue}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ label }: { label: string }) {
  const colors = STATUS_COLORS[label] ?? "bg-status-cancelled-tint text-status-cancelled";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wider ${colors}`}
    >
      {label}
    </span>
  );
}

interface JobCardProps {
  job: JobSummary;
}

export function JobCard({ job }: JobCardProps) {
  const display = job.title?.trim() || job.url;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-lg border border-line bg-surface px-4 py-3 transition-colors duration-150 ease-out-quart hover:bg-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 truncate text-sm text-ink" title={display}>
          {display}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <TypeBadge label={job.content_type} />
          <StatusBadge label={job.status} />
        </div>
      </div>
      <p className="mt-1 font-mono text-xs text-muted">
        {new Date(job.created_at).toLocaleString()}
      </p>
    </Link>
  );
}
