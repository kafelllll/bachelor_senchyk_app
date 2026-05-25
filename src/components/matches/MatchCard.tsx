import { Gauge, Leaf, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Recommendation } from '../../utils/announcementMapping';

type MatchCardProps = {
  match: Recommendation;
  onProposeExchange: (match: Recommendation) => void;
  isSubmitting?: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

const sizeLabel: Record<Recommendation['size'], string> = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
};

const conditionLabel: Record<Recommendation['condition'], string> = {
  healthy: 'Здорова',
  'needs-care': 'Потребує догляду',
};

const careLabel: Record<Recommendation['careLevel'], string> = {
  easy: 'Легкий догляд',
  medium: 'Середній догляд',
  hard: 'Складний догляд',
};

const levelClass: Record<Recommendation['matchLevel'], string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-200 text-slate-700',
};

const levelLabel: Record<Recommendation['matchLevel'], string> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

export default function MatchCard({
  match,
  onProposeExchange,
  isSubmitting,
  feedback,
}: MatchCardProps) {
  const score = Math.max(0, Math.min(100, Math.round(match.matchScore)));

  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-48 overflow-hidden">
        {match.image ? (
          <img
            src={match.image}
            alt={match.plantName}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
            Фото відсутнє
          </div>
        )}
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${levelClass[match.matchLevel]}`}
          >
            {levelLabel[match.matchLevel]}
          </span>
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800">
            {score}%
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">{match.plantName}</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            <Gauge className="h-3.5 w-3.5" />
            score
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{[match.city, match.district].filter(Boolean).join(', ') || 'Локація не вказана'}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <Ruler className="h-3.5 w-3.5" />
            {sizeLabel[match.size]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {conditionLabel[match.condition]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
            <Leaf className="h-3.5 w-3.5" />
            {careLabel[match.careLevel]}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            to={`/listings/${match.id}`}
            state={{ listing: match }}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label={`Відкрити оголошення ${match.plantName}`}
          >
            Відкрити оголошення
          </Link>
          <button
            type="button"
            onClick={() => onProposeExchange(match)}
            disabled={isSubmitting}
            className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isSubmitting
                ? 'cursor-not-allowed bg-slate-400'
                : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:opacity-95'
            }`}
            aria-label={`Запропонувати обмін для ${match.plantName}`}
          >
            {isSubmitting ? 'Надсилання...' : 'Запропонувати обмін'}
          </button>
        </div>

        {feedback ? (
          <p className={`text-xs font-medium ${feedback.tone === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
            {feedback.message}
          </p>
        ) : null}
      </div>
    </article>
  );
}
