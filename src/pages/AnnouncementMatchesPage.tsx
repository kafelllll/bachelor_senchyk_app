import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Star,
  User,
} from 'lucide-react';

import AppHeader from '../components/AppHeader';
import MatchesEmptyState from '../components/matches/MatchesEmptyState';
import MatchesSkeleton from '../components/matches/MatchesSkeleton';
import { AnnouncementServiceError, announcementService } from '../api/announcementService';
import { authService } from '../api/authService';
import { exchangeService } from '../api/exchangeService';
import {
  resolveBaseListing,
  resolveRecommendations,
  type BaseListing,
  type ListingType,
  type Recommendation,
} from '../utils/announcementMapping';
import { getNetworkErrorMessage } from '../utils/networkError';
import { formatRatingLine } from '../utils/ratingsFormat';

type ExchangeActionState = {
  isLoading: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

type MatchesPageState = 'ready' | 'blocked';
type MatchSortOption = 'relevance' | 'newest';
type MatchLevelFilter = 'all' | 'high' | 'medium' | 'low';

const blockedText = 'Рекомендації доступні лише для ваших оголошень';

const typeLabels: Record<ListingType, string> = {
  offering: 'Пропоную',
  'looking-for': 'Шукаю',
};

const typeClasses: Record<ListingType, string> = {
  offering: 'bg-green-100 text-green-700',
  'looking-for': 'bg-green-500 text-white',
};

const categoryLabels = {
  indoor: 'Кімнатна',
  succulent: 'Сукулент',
  other: 'Інше',
} as const;

const sizeLabels = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
} as const;

const conditionLabels = {
  healthy: 'Здорова',
  'needs-care': 'Потребує догляду',
} as const;

const careLabels = {
  easy: 'Легкий догляд',
  medium: 'Середній догляд',
  hard: 'Складний догляд',
} as const;

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

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return getNetworkErrorMessage(error) || fallback;
};

export default function AnnouncementMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<MatchesPageState>('ready');
  const [baseAnnouncement, setBaseAnnouncement] = useState<BaseListing | null>(null);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const [matches, setMatches] = useState<Recommendation[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<MatchSortOption>('relevance');
  const [levelFilter, setLevelFilter] = useState<MatchLevelFilter>('all');
  const [exchangeActions, setExchangeActions] = useState<Record<string, ExchangeActionState>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(authService.getUserId());

  const setExchangeState = (announcementId: string, next: ExchangeActionState) => {
    setExchangeActions((prev) => ({
      ...prev,
      [announcementId]: next,
    }));
  };

  const buildMessageLink = (listing: Recommendation) => {
    if (!listing.userId || listing.userId === currentUserId) return null;
    const params = new URLSearchParams({
      userId: listing.userId,
      announcementId: listing.id,
      userName: listing.userName,
      announcementTitle: listing.plantName,
    });
    return `/messages?${params.toString()}`;
  };

  const startExchange = async (match: Recommendation) => {
    if (!match.userId || !baseAnnouncement?.id) return;
    setExchangeState(match.id, { isLoading: true });
    try {
      await exchangeService.create({
        announcementId: match.id,
        receiverId: match.userId,
      });
      setExchangeState(match.id, {
        isLoading: false,
        feedback: {
          tone: 'success',
          message: 'Обмін ініційовано. Продовжіть у розділі "Мої обміни".',
        },
      });
    } catch (error) {
      setExchangeState(match.id, {
        isLoading: false,
        feedback: {
          tone: 'error',
          message: toErrorMessage(error, 'Не вдалося запропонувати обмін.'),
        },
      });
    }
  };

  useEffect(() => {
    const updateUser = () => setCurrentUserId(authService.getUserId());
    window.addEventListener('auth-token-changed', updateUser);
    window.addEventListener('storage', updateUser);
    return () => {
      window.removeEventListener('auth-token-changed', updateUser);
      window.removeEventListener('storage', updateUser);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const ensureCurrentUserId = async () => {
      const localUserId = authService.getUserId();
      if (localUserId) return localUserId;
      const me = await authService.me();
      return me.id ?? null;
    };

    const loadBaseAnnouncement = async () => {
      if (!id) {
        setBaseError('Оголошення не знайдено.');
        setBaseLoading(false);
        setMatchesLoading(false);
        return;
      }

      try {
        setBaseLoading(true);
        setBaseError(null);
        setPageState('ready');

        const listingPayload = await announcementService.getById(id);
        if (!isMounted) return;

        const listing = resolveListingFromPayload(listingPayload);
        if (!listing) {
          setBaseAnnouncement(null);
          setBaseError('Оголошення не знайдено.');
          return;
        }

        const viewerId = await ensureCurrentUserId();
        if (!isMounted) return;

        if (!viewerId) {
          navigate('/auth', { replace: true });
          return;
        }

        if (listing.userId && listing.userId !== viewerId) {
          setBaseAnnouncement(listing);
          setPageState('blocked');
          setBaseError(blockedText);
          setMatches([]);
          setMatchesLoading(false);
          return;
        }

        setBaseAnnouncement(listing);
        setSelectedImageIndex(0);
      } catch (error) {
        if (!isMounted) return;
        if (error instanceof AnnouncementServiceError && error.status === 401) {
          navigate('/auth', { replace: true });
          return;
        }
        if (error instanceof AnnouncementServiceError && (error.status === 403 || error.status === 404)) {
          setPageState('blocked');
          setBaseError(blockedText);
          setMatches([]);
          setMatchesLoading(false);
          return;
        }

        setBaseAnnouncement(null);
        setBaseError(toErrorMessage(error, 'Не вдалося завантажити оголошення.'));
      } finally {
        if (isMounted) {
          setBaseLoading(false);
        }
      }
    };

    void loadBaseAnnouncement();

    return () => {
      isMounted = false;
    };
  }, [id, navigate]);

  const loadMatches = async (announcementId: string) => {
    try {
      setMatchesLoading(true);
      setMatchesError(null);
      const payload = await announcementService.listMatchesByAnnouncementId(announcementId);
      setMatches(resolveRecommendations(payload));
    } catch (error) {
      if (error instanceof AnnouncementServiceError && error.status === 401) {
        navigate('/auth', { replace: true });
        return;
      }
      if (error instanceof AnnouncementServiceError && (error.status === 403 || error.status === 404)) {
        setPageState('blocked');
        setMatches([]);
        setMatchesError(blockedText);
        return;
      }

      setMatchesError(toErrorMessage(error, 'Не вдалося отримати рекомендовані збіги.'));
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  useEffect(() => {
    if (!baseAnnouncement || baseError || !id || pageState === 'blocked') return;
    void loadMatches(id);
  }, [baseAnnouncement, baseError, id, pageState]);

  const visibleMatches = useMemo(() => {
    const filtered =
      levelFilter === 'all'
        ? matches
        : matches.filter((match) => match.matchLevel === levelFilter);

    const sorted = [...filtered];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      return sorted;
    }

    sorted.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    return sorted;
  }, [levelFilter, matches, sortBy]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        {baseLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо оголошення...</p>
          </div>
        ) : baseError && !baseAnnouncement ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{baseError}</p>
          </div>
        ) : !baseAnnouncement ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Оголошення не знайдено.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-clamp-1 text-xl font-bold text-slate-950">{baseAnnouncement.plantName}</h1>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-5">
                <section className="overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm">
                  <div className="relative h-[320px] overflow-hidden">
                    <img
                      src={baseAnnouncement.images[selectedImageIndex] || baseAnnouncement.image}
                      alt={baseAnnouncement.plantName}
                      className="h-full w-full object-cover"
                    />
                    {baseAnnouncement.images.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedImageIndex((prev) =>
                              prev === 0 ? baseAnnouncement.images.length - 1 : prev - 1
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
                              prev === baseAnnouncement.images.length - 1 ? 0 : prev + 1
                            )
                          }
                          className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {baseAnnouncement.images.length > 1 ? (
                    <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50 p-4">
                      {baseAnnouncement.images.map((image, index) => (
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
                    <span className={`max-w-full text-clamp-1 rounded-full px-4 py-1.5 text-xs font-semibold ${typeClasses[baseAnnouncement.type]}`}>
                      {typeLabels[baseAnnouncement.type]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {categoryLabels[baseAnnouncement.category]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {sizeLabels[baseAnnouncement.size]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {conditionLabels[baseAnnouncement.condition]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {careLabels[baseAnnouncement.careLevel]}
                    </span>
                  </div>

                  <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Локація</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                        <MapPin className="h-4 w-4 shrink-0 text-green-700" />
                        <span className="min-w-0 flex-1 text-clamp-1">{baseAnnouncement.location}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Опубліковано</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                        <Calendar className="h-4 w-4 shrink-0 text-green-700" />
                        <span className="min-w-0 flex-1 text-clamp-1">{baseAnnouncement.postedDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Опис</h2>
                    <p className="text-sm leading-6 text-slate-600">
                      {baseAnnouncement.description || 'Без опису.'}
                    </p>
                  </div>

                  {(baseAnnouncement.wateringFreq ||
                    baseAnnouncement.lightReqs ||
                    baseAnnouncement.humidity ||
                    baseAnnouncement.toxicity ||
                    baseAnnouncement.growthRate ||
                    baseAnnouncement.hasOffspring) && (
                    <div className="mb-6">
                      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Умови вирощування</h2>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {baseAnnouncement.wateringFreq && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Частота поливу</p>
                            <p className="text-sm font-medium text-slate-900">
                              {baseAnnouncement.wateringFreq === 'rare'
                                ? 'Рідко'
                                : baseAnnouncement.wateringFreq === 'moderate'
                                  ? 'Помірно'
                                  : 'Часто'}
                            </p>
                          </div>
                        )}
                        {baseAnnouncement.lightReqs && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Вимоги до світла</p>
                            <p className="text-sm font-medium text-slate-900">
                              {baseAnnouncement.lightReqs === 'bright'
                                ? 'Яскраве світло'
                                : baseAnnouncement.lightReqs === 'partial'
                                  ? 'Частково тінь'
                                  : 'Тінь'}
                            </p>
                          </div>
                        )}
                        {baseAnnouncement.humidity && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Вологість повітря</p>
                            <p className="text-sm font-medium text-slate-900">
                              {baseAnnouncement.humidity === 'low'
                                ? 'Низька'
                                : baseAnnouncement.humidity === 'medium'
                                  ? 'Середня'
                                  : 'Висока'}
                            </p>
                          </div>
                        )}
                        {baseAnnouncement.toxicity && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Отруйність</p>
                            <p className="text-sm font-medium text-slate-900">
                              {baseAnnouncement.toxicity === 'non-toxic'
                                ? 'Нетоксична'
                                : baseAnnouncement.toxicity === 'slightly-toxic'
                                  ? 'Слабко токсична'
                                  : 'Токсична'}
                            </p>
                          </div>
                        )}
                        {baseAnnouncement.growthRate && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Швидкість росту</p>
                            <p className="text-sm font-medium text-slate-900">
                              {baseAnnouncement.growthRate === 'slow'
                                ? 'Повільна'
                                : baseAnnouncement.growthRate === 'moderate'
                                  ? 'Помірна'
                                  : 'Швидка'}
                            </p>
                          </div>
                        )}
                        {baseAnnouncement.hasOffspring && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <p className="text-xs text-slate-500">Дітки</p>
                            <p className="text-sm font-medium text-slate-900">Можна розділити</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(baseAnnouncement.pestFree || baseAnnouncement.readyToExchange) && (
                    <div className="mb-6">
                      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Додаткові опції</h2>
                      <div className="flex flex-wrap gap-2">
                        {baseAnnouncement.pestFree && (
                          <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                            ✓ Без шкідників
                          </span>
                        )}
                        {baseAnnouncement.readyToExchange && (
                          <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                            ✓ Готовий до обміну
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-slate-200 pt-6">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Додаткова інформація</h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Загальна назва</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.commonName || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Наукова назва</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.scientificName || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Рід</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.genus || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Родина</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.family || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Місто</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.city || '—'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                        <p className="text-xs text-slate-500">Район</p>
                        <p className="text-sm font-medium text-slate-900">{baseAnnouncement.district || '—'}</p>
                      </div>
                    </div>

                    {baseAnnouncement.additionalTags && baseAnnouncement.additionalTags.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Додаткові теги</p>
                        <div className="flex flex-wrap gap-2">
                          {baseAnnouncement.additionalTags.map((tag) => (
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
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <div className="sticky top-24 space-y-4">
                  <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-base font-bold text-slate-950">Збіги для цього оголошення</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as MatchSortOption)}
                        className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-slate-700 focus:border-green-500 focus:outline-none"
                      >
                        <option value="relevance">Найрелевантніші</option>
                        <option value="newest">Найновіші</option>
                      </select>
                      <select
                        value={levelFilter}
                        onChange={(event) => setLevelFilter(event.target.value as MatchLevelFilter)}
                        className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-slate-700 focus:border-green-500 focus:outline-none"
                      >
                        <option value="all">Всі</option>
                        <option value="high">Високий</option>
                        <option value="medium">Середній</option>
                        <option value="low">Низький</option>
                      </select>
                    </div>
                  </div>

                  {pageState === 'blocked' ? (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-amber-900">{blockedText}</p>
                      <button
                        type="button"
                        onClick={() => navigate('/my-announcements')}
                        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                      >
                        Повернутися до моїх оголошень
                      </button>
                    </div>
                  ) : matchesLoading ? (
                    <MatchesSkeleton count={4} />
                  ) : matchesError ? (
                    <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-6 text-center">
                      <p className="text-sm font-medium text-red-700">{matchesError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (!id) return;
                          void loadMatches(id);
                        }}
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Спробувати ще
                      </button>
                    </div>
                  ) : visibleMatches.length === 0 ? (
                    <MatchesEmptyState />
                  ) : (
                    <div className="space-y-4">
                      {visibleMatches.map((listing, index) => {
                        const isInactive = listing.status !== 'active';
                        const canStartExchange = Boolean(
                          !isInactive && listing.userId && listing.userId !== currentUserId
                        );
                        const exchangeState = exchangeActions[listing.id];
                        const messageLink = isInactive ? null : buildMessageLink(listing);

                        return (
                          <article
                            key={`${listing.id}-${index}`}
                            onClick={() => navigate(`/listings/${listing.id}`, { state: { listing } })}
                            className="group flex w-full flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                          >
                            <div className="relative h-[150px] overflow-hidden">
                              <img
                                src={listing.image}
                                alt={listing.plantName}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                              />
                              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-yellow-400/80 px-3.5 py-2 text-sm font-semibold text-slate-900">
                                <Sparkles className="h-4.5 w-4.5" />
                                {Math.round(listing.matchScore ?? 0)}%
                              </div>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col p-[14px]">
                              <div className="mb-2.5 flex items-start justify-between gap-3">
                                <h3 className="min-w-0 flex-1 text-clamp-1 text-[17px] font-bold leading-tight text-slate-950">
                                  {listing.plantName}
                                </h3>
                                <span
                                  className={`shrink-0 max-w-[45%] text-clamp-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                    typeClasses[listing.type]
                                  }`}
                                >
                                  {typeLabels[listing.type]}
                                </span>
                              </div>

                              <div className="mb-2.5 flex flex-wrap gap-2">
                                <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                                  {categoryLabels[listing.category]}
                                </span>
                                <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                                  {sizeLabels[listing.size]}
                                </span>
                                <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                                  {conditionLabels[listing.condition]}
                                </span>
                                <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                                  {careLabels[listing.careLevel]}
                                </span>
                              </div>

                              <div className="mb-2.5 space-y-2 text-sm text-slate-500">
                                <div className="flex min-w-0 items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  <span className="min-w-0 flex-1 text-clamp-1">{listing.location}</span>
                                </div>
                              </div>

                              <div className="mt-auto flex flex-col border-t border-slate-100 pt-2.5">
                                <Link
                                  to={listing.userId ? `/users/${listing.userId}` : '#'}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!listing.userId) event.preventDefault();
                                  }}
                                  className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
                                      {listing.userAvatar ? (
                                        <img
                                          src={listing.userAvatar}
                                          alt={listing.userName}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <User className="h-4 w-4 text-green-700" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                                        {listing.userName}
                                      </p>
                                      <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
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

                                {canStartExchange ? (
                                  <button
                                    type="button"
                                    onClick={() => startExchange(listing)}
                                    disabled={exchangeState?.isLoading}
                                    className={`order-2 mt-2.5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                                      exchangeState?.isLoading
                                        ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                                        : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                                    }`}
                                  >
                                    {exchangeState?.isLoading ? 'Створення...' : 'Запропонувати обмін'}
                                  </button>
                                ) : null}

                                {messageLink ? (
                                  <Link
                                    to={messageLink}
                                    className="message-action-link order-3 mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-700 px-4 py-2.5 text-sm font-semibold text-green-700 transition"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                    Написати повідомлення
                                  </Link>
                                ) : null}

                                {exchangeState?.feedback ? (
                                  <p
                                    className={`mt-2 text-clamp-2 text-xs font-medium ${
                                      exchangeState.feedback.tone === 'success' ? 'text-emerald-600' : 'text-red-600'
                                    }`}
                                  >
                                    {exchangeState.feedback.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

