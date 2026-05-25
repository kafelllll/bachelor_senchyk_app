type MatchesSkeletonProps = {
  count?: number;
};

export default function MatchesSkeleton({ count = 8 }: MatchesSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={`match-skeleton-${index}`}
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="h-48 animate-pulse bg-slate-200" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-3/5 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-7 animate-pulse rounded-full bg-slate-200" />
              <div className="h-7 animate-pulse rounded-full bg-slate-200" />
              <div className="h-7 animate-pulse rounded-full bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-11 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-11 animate-pulse rounded-xl bg-slate-200" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
