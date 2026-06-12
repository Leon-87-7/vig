import Link from "next/link";
import { StatusBadge, TypeBadge } from "@/components/badges";

export interface JobSummary {
  id: string;
  title?: string | null;
  url: string;
  content_type: string;
  status: string;
  created_at: string;
}

interface JobCardProps {
  job: JobSummary;
}

export function JobCard({ job }: JobCardProps) {
  const display = job.title?.trim() || job.url;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-lg border border-line bg-surface px-4 py-3 transition-ui hover:bg-raised"
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
