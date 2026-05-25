import { Leaf } from 'lucide-react';

export default function MatchesEmptyState() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Leaf className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600">
        Наразі немає релевантних парних оголошень
      </p>
    </div>
  );
}
