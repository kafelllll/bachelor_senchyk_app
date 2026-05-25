import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';

import AppHeader from '../components/AppHeader';
import { announcementService } from '../api/announcementService';
import { exchangeService } from '../api/exchangeService';
import { authService } from '../api/authService';
import { resolveBaseListing, type BaseListing, type ListingType } from '../utils/announcementMapping';
import { getNetworkErrorMessage } from '../utils/networkError';
import { formatRatingLine } from '../utils/ratingsFormat';
import { useRatingsCache } from '../hooks/useRatingsCache';


const typeLabels: Record<ListingType, string> = {
  offering: 'Пропоную',
  'looking-for': 'Шукаю',
};

const typeClasses: Record<ListingType, string> = {
  offering: 'bg-green-100 text-green-700',
  'looking-for': 'bg-green-500 text-white',
};

const resolveListingFromPayload = (payload: unknown): BaseListing | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as {
    announcement?: unknown;
    data?: unknown;
    result?: unknown;
  };

  const candidate =
    (record.announcement as Record<string, unknown> | undefined) ??
    (record.data as Record<string, unknown> | undefined) ??
    (record.result as Record<string, unknown> | undefined) ??
    (payload as Record<string, unknown>);

  if (!candidate || typeof candidate !== 'object') return null;
  return resolveBaseListing(candidate as Record<string, unknown>);
};

type LocationState = {
  listing?: BaseListing;
};

type ExchangeActionState = {
  isLoading: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

export default function ListingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const stateListing = (location.state as LocationState | undefined)?.listing;
  const [listing, setListing] = useState<BaseListing | null>(
    stateListing && stateListing.id === id ? stateListing : null
  );
  const [isLoading, setIsLoading] = useState(!listing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [exchangeState, setExchangeState] = useState<ExchangeActionState>({
    isLoading: false,
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(authService.getUserId());

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const me = await authService.me();
        if (isMounted) {
          setCurrentUserId(me.id ?? null);
        }
      } catch {
        if (isMounted) {
          setCurrentUserId(null);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (stateListing && stateListing.id === id) {
      setListing(stateListing);
    }
  }, [stateListing?.id, id]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const loadListing = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const payload = await announcementService.getById(id);
        if (!isMounted) return;
        const resolved = resolveListingFromPayload(payload);
        if (resolved) {
          setListing(resolved);
          setSelectedImageIndex(0);
        }
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadListing();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const ratingUserIds = useMemo(() => (listing?.userId ? [listing.userId] : []), [listing?.userId]);
  const { ratingsByUserId } = useRatingsCache(ratingUserIds);
  const ratingSummary = listing?.userId ? ratingsByUserId[listing.userId] : undefined;

  const messageLink = useMemo(() => {
    if (!listing?.userId || listing.userId === currentUserId) return null;
    const params = new URLSearchParams({
      userId: listing.userId,
      announcementId: listing.id,
      userName: listing.userName,
      announcementTitle: listing.plantName,
    });
    return `/messages?${params.toString()}`;
  }, [listing?.userId, listing?.id, listing?.plantName, listing?.userName, currentUserId]);

  const canStartExchange = Boolean(
    listing?.userId && listing.userId !== currentUserId && listing.status === 'active'
  );

  const startExchange = async () => {
    if (!listing?.userId) return;
    setExchangeState({ isLoading: true });
    try {
      await exchangeService.create({
        announcementId: listing.id,
        receiverId: listing.userId,
      });
      setExchangeState({
        isLoading: false,
        feedback: {
          tone: 'success',
          message: 'Обмін ініційовано. Перейдіть у розділ “Мої обміни”.',
        },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setExchangeState({
        isLoading: false,
        feedback: { tone: 'error', message },
      });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо оголошення...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : !listing ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Оголошення не знайдено.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-clamp-1 text-xl font-bold text-slate-950">{listing.plantName}</h1>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <section className="overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm">
                  <div className="relative h-[320px] overflow-hidden">
                    <img
                      src={listing.images[selectedImageIndex] || listing.image}
                      alt={listing.plantName}
                      className="h-full w-full object-cover"
                    />
                    {listing.images.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedImageIndex((prev) =>
                              prev === 0 ? listing.images.length - 1 : prev - 1
                            )
                          }
                          className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedImageIndex((prev) =>
                              prev === listing.images.length - 1 ? 0 : prev + 1
                            )
                          }
                          className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {listing.images.length > 1 ? (
                    <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50 p-4">
                      {listing.images.map((image, index) => (
                        <button
                          key={`${image}-${index}`}
                          type="button"
                          onClick={() => setSelectedImageIndex(index)}
                          className={`h-16 w-20 overflow-hidden rounded-xl border transition ${
                            index === selectedImageIndex
                              ? 'border-green-500 ring-2 ring-green-500/20'
                              : 'border-transparent'
                          }`}
                        >
                          <img src={image} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className={`max-w-full text-clamp-1 rounded-full px-4 py-1.5 text-xs font-semibold ${typeClasses[listing.type]}`}>
                      {typeLabels[listing.type]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {listing.category === 'indoor' ? 'Кімнатна' : listing.category === 'succulent' ? 'Сукулент' : 'Інше'}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {listing.size === 'small' ? 'Малий' : listing.size === 'medium' ? 'Середній' : 'Великий'}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {listing.condition === 'healthy' ? 'Здорова' : 'Потребує догляду'}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {listing.careLevel === 'easy'
                        ? 'Легкий догляд'
                        : listing.careLevel === 'medium'
                          ? 'Середній догляд'
                          : 'Складний догляд'}
                    </span>
                  </div>

                  <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Локація</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                        <MapPin className="h-4 w-4 shrink-0 text-green-700" />
                        <span className="min-w-0 flex-1 text-clamp-1">{listing.location}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Опубліковано</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                        <Calendar className="h-4 w-4 shrink-0 text-green-700" />
                        <span className="min-w-0 flex-1 text-clamp-1">{listing.postedDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Опис</h2>
                    <p className="text-sm leading-6 text-slate-600">
                      {listing.description || 'Без опису.'}
                    </p>
                  </div>

                  {(listing.wateringFreq || listing.lightReqs || listing.humidity || listing.toxicity || listing.growthRate || listing.hasOffspring) && (
                    <div className="mb-5">
                      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Умови вирощування</h2>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {listing.wateringFreq && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Частота поливу</p>
                            <p className="text-sm font-medium text-slate-900">
                              {listing.wateringFreq === 'rare'
                                ? 'Рідко'
                                : listing.wateringFreq === 'moderate'
                                  ? 'Помірно'
                                  : 'Часто'}
                            </p>
                          </div>
                        )}
                        {listing.lightReqs && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Вимоги до світла</p>
                            <p className="text-sm font-medium text-slate-900">
                              {listing.lightReqs === 'bright'
                                ? 'Яскраве світло'
                                : listing.lightReqs === 'partial'
                                  ? 'Частково тінь'
                                  : 'Тінь'}
                            </p>
                          </div>
                        )}
                        {listing.humidity && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Вологість повітря</p>
                            <p className="text-sm font-medium text-slate-900">
                              {listing.humidity === 'low'
                                ? 'Низька'
                                : listing.humidity === 'medium'
                                  ? 'Середня'
                                  : 'Висока'}
                            </p>
                          </div>
                        )}
                        {listing.toxicity && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Отруйність</p>
                            <p className="text-sm font-medium text-slate-900">
                              {listing.toxicity === 'non-toxic'
                                ? 'Нетоксична'
                                : listing.toxicity === 'slightly-toxic'
                                  ? 'Слабко токсична'
                                  : 'Токсична'}
                            </p>
                          </div>
                        )}
                        {listing.growthRate && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Швидкість росту</p>
                            <p className="text-sm font-medium text-slate-900">
                              {listing.growthRate === 'slow'
                                ? 'Повільна'
                                : listing.growthRate === 'moderate'
                                  ? 'Помірна'
                                  : 'Швидка'}
                            </p>
                          </div>
                        )}
                        {listing.hasOffspring && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Дітки</p>
                            <p className="text-sm font-medium text-slate-900">Можна розділити</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(listing.pestFree || listing.readyToExchange) && (
                    <div>
                      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Додаткові опції</h2>
                      <div className="flex flex-wrap gap-2">
                        {listing.pestFree && (
                          <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                            ✓ Без шкідників
                          </span>
                        )}
                        {listing.readyToExchange && (
                          <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                            ✓ Готовий до обміну
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 border-t border-slate-200 pt-6">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Додаткова інформація</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Загальна назва</p>
                        <p className="text-sm font-medium text-slate-900">{listing.commonName || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Наукова назва</p>
                        <p className="text-sm font-medium text-slate-900">{listing.scientificName || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Рід</p>
                        <p className="text-sm font-medium text-slate-900">{listing.genus || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Родина</p>
                        <p className="text-sm font-medium text-slate-900">{listing.family || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Місто</p>
                        <p className="text-sm font-medium text-slate-900">{listing.city || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Район</p>
                        <p className="text-sm font-medium text-slate-900">{listing.district || '—'}</p>
                      </div>
                    </div>

                    {listing.additionalTags && listing.additionalTags.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Додаткові теги</p>
                        <div className="flex flex-wrap gap-2">
                          {listing.additionalTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Без шкідників</p>
                        <p className="text-sm font-medium text-slate-900">{listing.pestFree ? 'Так' : 'Ні'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Готовність до обміну</p>
                        <p className="text-sm font-medium text-slate-900">{listing.readyToExchange ? 'Так' : 'Ні'}</p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <div className="sticky top-24 space-y-4">
                  <div className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Про автора</h2>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      {listing.userId ? (
                        <Link to={`/users/${listing.userId}`} className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                            {listing.userAvatar ? (
                              <img
                                src={listing.userAvatar}
                                alt={listing.userName}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <User className="h-5 w-5 text-green-700" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-clamp-1 text-sm font-semibold text-slate-900">{listing.userName}</p>
                            <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                              <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                              <span className="min-w-0 text-clamp-1">
                                {formatRatingLine({
                                  averageRating: ratingSummary?.averageRating ?? listing.userRating,
                                  ratingsCount: ratingSummary?.ratingsCount ?? listing.ratingsCount,
                                  completedExchangesCount:
                                    ratingSummary?.completedExchangesCount ?? listing.completedExchanges,
                                })}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                            {listing.userAvatar ? (
                              <img
                                src={listing.userAvatar}
                                alt={listing.userName}
                                className="h-12 w-12 rounded-full object-cover"
                              />
                            ) : (
                              <User className="h-5 w-5 text-green-700" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-clamp-1 text-sm font-semibold text-slate-900">{listing.userName}</p>
                            <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                              <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                              <span className="min-w-0 text-clamp-1">
                                {formatRatingLine({
                                  averageRating: ratingSummary?.averageRating ?? listing.userRating,
                                  ratingsCount: ratingSummary?.ratingsCount ?? listing.ratingsCount,
                                  completedExchangesCount:
                                    ratingSummary?.completedExchangesCount ?? listing.completedExchanges,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700"
                        title="Перевірений"
                        aria-label="Перевірений"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="hidden">
                      <ShieldCheck className="h-4 w-4" />
                      Перевірений
                    </div>

                    <button
                      type="button"
                      className="hidden"
                    >
                      Переглянути профіль
                    </button>

                    <div className="mt-4 flex flex-col gap-3">
                      {messageLink ? (
                        <Link
                          to={messageLink}
                          className="message-action-link order-2 flex items-center justify-center gap-2 rounded-xl border border-green-700 px-5 py-2.5 text-sm font-semibold text-green-700 transition"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Написати повідомлення
                        </Link>
                      ) : null}

                      {canStartExchange ? (
                        <button
                          type="button"
                          onClick={startExchange}
                          disabled={exchangeState.isLoading}
                          className={`order-1 flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                            exchangeState.isLoading
                              ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                              : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                          }`}
                        >
                          {exchangeState.isLoading ? 'Створення...' : 'Запропонувати обмін'}
                        </button>
                      ) : null}
                    </div>

                    {exchangeState.feedback ? (
                      <p
                        className={`mt-3 text-xs font-medium ${
                          exchangeState.feedback.tone === 'success' ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        {exchangeState.feedback.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
