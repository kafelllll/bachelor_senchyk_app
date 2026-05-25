import { MapPin, MessageCircle, Sparkles, Star, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BaseListing, MatchLevel } from '../utils/announcementMapping';
import { formatRatingLine } from '../utils/ratingsFormat';

type ListingCardProps = {
  listing: BaseListing;
  typeLabel: string;
  typeClass: string;
  categoryLabel: string;
  sizeLabel: string;
  conditionLabel: string;
  careLabel: string;
  statusLabel?: string;
  statusClass?: string;
  onClick?: () => void;
  showMatchBadge?: boolean;
  matchLevel?: MatchLevel;
  layout?: 'grid' | 'list';
  variant?: 'default' | 'recommended' | 'match';
  messageLink?: string | null;
  showReputation?: boolean;
  exchangeAction?: {
    label?: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    feedback?: { tone: 'success' | 'error'; message: string };
  };
};

export default function ListingCard({
  listing,
  typeLabel,
  typeClass,
  categoryLabel,
  sizeLabel,
  conditionLabel,
  careLabel,
  statusLabel,
  statusClass,
  onClick,
  showMatchBadge = false,
  layout = 'grid',
  variant = 'default',
  messageLink,
  showReputation = false,
  exchangeAction,
}: ListingCardProps) {
  const isList = layout === 'list';
  const matchScore = listing.matchScore;
  const matchBadgeVisible = showMatchBadge && typeof matchScore === 'number';
  const isInactive = listing.status !== 'active';

  const wrapperClass = isList
    ? `flex min-w-0 w-full gap-4 rounded-[24px] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        variant === 'recommended' ? 'border-green-300' : 'border-gray-200'
      } ${isInactive ? 'opacity-70' : ''}`
    : `listing-card group self-start flex min-w-0 w-full max-w-[345px] cursor-pointer flex-col overflow-hidden rounded-[24px] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
        variant === 'recommended' ? 'border-2 border-green-500' : 'border-gray-200'
      } ${isInactive ? 'opacity-70' : ''}`;

  return (
    <article className={wrapperClass} onClick={onClick}>
      <div
        className={
          isList
            ? 'relative h-28 w-36 shrink-0 overflow-hidden rounded-2xl'
            : 'relative h-[150px] overflow-hidden'
        }
      >
        {listing.image ? (
          <img
            src={listing.image}
            alt={listing.plantName}
            className={
              isList
                ? 'h-full w-full object-cover'
                : 'h-full w-full object-cover transition duration-300 group-hover:scale-105'
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
            Фото відсутнє
          </div>
        )}

        {statusLabel && statusClass ? (
          <span
            className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass}`}
          >
            {statusLabel}
          </span>
        ) : null}

        {matchBadgeVisible ? (
          <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-yellow-400/80 px-3.5 py-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4.5 w-4.5" />
            {Math.round(matchScore)}%
          </div>
        ) : null}
      </div>

      <div className={isList ? 'flex min-w-0 flex-1 flex-col' : 'flex min-w-0 flex-1 flex-col p-[14px]'}>
        <div
          className={
            isList
              ? 'flex items-start justify-between gap-3'
              : 'mb-2.5 flex items-start justify-between gap-3'
          }
        >
          <h3 className="min-w-0 flex-1 text-clamp-1 text-[17px] font-bold leading-tight text-slate-950">
            {listing.plantName}
          </h3>
          <span
            className={`shrink-0 max-w-[45%] text-clamp-1 rounded-full px-3 py-1 text-xs font-semibold ${typeClass}`}
          >
            {typeLabel}
          </span>
        </div>

        <div className={isList ? 'mt-2.5 flex flex-wrap gap-2' : 'mb-2.5 flex flex-wrap gap-2'}>
          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {categoryLabel}
          </span>
          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {sizeLabel}
          </span>
          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {conditionLabel}
          </span>
          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {careLabel}
          </span>
        </div>

        <div className={isList ? 'mt-2.5 text-sm text-slate-500' : 'mb-2.5 text-sm text-slate-500'}>
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="min-w-0 flex-1 text-clamp-1">{listing.location}</span>
          </div>
        </div>

        {isList && showReputation ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Репутація:{' '}
              {typeof listing.reputationScore === 'number' ? listing.reputationScore.toFixed(1) : '—'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Вплив:{' '}
              {typeof listing.reputationContribution === 'number'
                ? listing.reputationContribution.toFixed(2)
                : '—'}
            </span>
          </div>
        ) : null}

        {isList ? (
          <p className="mt-3 text-clamp-3 text-sm text-slate-600">{listing.description || 'Без опису'}</p>
        ) : null}

        <div className="mt-auto border-t border-slate-100 pt-2.5">
          {listing.userId ? (
            <Link
              to={`/users/${listing.userId}`}
              onClick={(event) => event.stopPropagation()}
              className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
                  {listing.userAvatar ? (
                    <img src={listing.userAvatar} alt={listing.userName} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-green-700" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-clamp-1 text-sm font-semibold text-slate-900">{listing.userName}</p>
                  <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                    <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                    <span className="min-w-0 text-clamp-1">
                      {formatRatingLine({
                        averageRating: listing.userRating,
                        ratingsCount: listing.ratingsCount,
                        completedExchangesCount: listing.completedExchanges,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
                {listing.userAvatar ? (
                  <img src={listing.userAvatar} alt={listing.userName} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-green-700" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-clamp-1 text-sm font-semibold text-slate-900">{listing.userName}</p>
                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                  <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                  <span className="min-w-0 text-clamp-1">
                    {formatRatingLine({
                      averageRating: listing.userRating,
                      ratingsCount: listing.ratingsCount,
                      completedExchangesCount: listing.completedExchanges,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isInactive ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">Оголошення неактивне</p>
          ) : null}

          {!isInactive && exchangeAction ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                exchangeAction.onClick();
              }}
              disabled={exchangeAction.disabled || exchangeAction.loading}
              className={`mt-2.5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                exchangeAction.disabled || exchangeAction.loading
                  ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                  : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
              }`}
            >
              {exchangeAction.loading ? 'Створення...' : exchangeAction.label ?? 'Запропонувати обмін'}
            </button>
          ) : null}

          {!isInactive && messageLink ? (
            <Link
              to={messageLink}
              onClick={(event) => event.stopPropagation()}
              className="message-action-link mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-700 px-4 py-2.5 text-sm font-semibold text-green-700 transition"
            >
              <MessageCircle className="h-4 w-4 shrink-0" />
              Написати повідомлення
            </Link>
          ) : null}
        </div>

        {exchangeAction?.feedback ? (
          <p
            className={`mt-2.5 text-clamp-2 text-xs font-medium ${
              exchangeAction.feedback.tone === 'success' ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {exchangeAction.feedback.message}
          </p>
        ) : null}
      </div>
    </article>
  );
}
