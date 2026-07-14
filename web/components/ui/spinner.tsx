// Small shared product primitive (DESIGN.md).

export function Spinner({ size = 4 }: { size?: 3 | 4 }) {
  const dim = size === 3 ? "h-3 w-3" : "h-4 w-4";
  return (
    <span
      aria-hidden="true"
      className={`inline-block ${dim} animate-spin motion-reduce:animate-none rounded-full border-2 border-line border-t-ink`}
    />
  );
}
