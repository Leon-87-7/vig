import Link from "next/link";

export interface SpaceSummary {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export function SpaceCard({ space }: { space: SpaceSummary }) {
  return (
    <Link href={`/spaces/${space.id}`}>
      <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-ui hover:bg-raised">
        <span
          className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
          style={{ backgroundColor: space.color }}
        />
        <span className="truncate text-sm font-medium text-ink">
          {space.name}
        </span>
      </div>
    </Link>
  );
}
