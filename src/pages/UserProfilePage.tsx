import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, MessageCircle, User, Star } from 'lucide-react';

import AppHeader from '../components/AppHeader';
import ListingCard from '../components/ListingCard';
import { announcementService, type Category, type Size, type Condition, type CareLevel } from '../api/announcementService';
import { authService } from '../api/authService';
import { exchangeService } from '../api/exchangeService';
import { profileService, type Profile } from '../api/profileService';
import { ratingService, type RatingSummary } from '../api/ratingService';
import { resolveListings, type BaseListing, type ListingType } from '../utils/announcementMapping';
import { formatDate } from '../utils/date';
import { getNetworkErrorMessage } from '../utils/networkError';
const typeLabels: Record<ListingType, string> = {
  offering: 'Пропоную',
  'looking-for': 'Шукаю',
};

const typeClasses: Record<ListingType, string> = {
  offering: 'bg-green-100 text-green-700',
  'looking-for': 'bg-green-500 text-white',
};

const categoryLabels: Record<Category, string> = {
  indoor: 'Кімнатна',
  succulent: 'Сукулент',
  other: 'Інше',
};

const sizeLabels: Record<Size, string> = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
};

const conditionLabels: Record<Condition, string> = {
  healthy: 'Здорова',
  'needs-care': 'Потребує догляду',
};

const careLabels: Record<CareLevel, string> = {
  easy: 'Легкий догляд',
  medium: 'Середній догляд',
  hard: 'Складний догляд',
};

const cardsGridClass =
  'mx-auto grid w-full max-w-[1452px] items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(345px,100%),345px))]';

type ExchangeActionState = {
  isLoading: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<BaseListing[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingListings, setIsLoadingListings] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [exchangeActions, setExchangeActions] = useState<Record<string, ExchangeActionState>>({});

  const currentUserId = authService.getUserId();

  useEffect(() => {
    if (id && currentUserId && id === currentUserId) {
      navigate('/profile', { replace: true });
    }
  }, [id, currentUserId, navigate]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setIsLoadingProfile(true);
        setLoadError(null);
        const data = await profileService.getById(id);
        if (!isMounted) return;
        setProfile(data);
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const loadListings = async () => {
      try {
        setIsLoadingListings(true);
        setListingsError(null);
        const searchResult = await announcementService.search({ userId: id });
        const items = Array.isArray(searchResult.items) ? searchResult.items : [];
        const resolved = resolveListings(items);

        if (resolved.length > 0) {
          if (isMounted) setListings(resolved);
          return;
        }

        const listResponse = await announcementService.list();
        const allListings = resolveListings(listResponse);
        const filtered = allListings.filter((listing) => listing.userId === id);
        if (isMounted) setListings(filtered);
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setListingsError(message);
      } finally {
        if (isMounted) {
          setIsLoadingListings(false);
        }
      }
    };

    loadListings();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const displayName = profile?.name || 'Користувач';
  const displayCity = profile?.city || 'Місто не вказано';
  const displayBio = profile?.bio || 'Користувач ще не додав опис.';
  const avatar = (profile?.avatar ?? profile?.avatarUrl)?.trim();
  const ratingsCount = profile?.ratingSummary?.ratingsCount ?? 0;
  const completedExchangesCount = profile?.ratingSummary?.completedExchangesCount ?? 0;
  const averageRating = profile?.ratingSummary?.averageRating ?? 0;
  const hasRatings = ratingsCount > 0;
  const activeCount = profile?.activeAnnouncementsCount ?? 0;
  const totalCount = profile?.totalAnnouncementsCount ?? 0;
  const [reviews, setReviews] = useState<RatingSummary['latestReviews'] | null>(
    profile?.ratingSummary?.latestReviews ?? null
  );
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const messageLink = useMemo(() => {
    if (!profile?.id || profile.id === currentUserId) return null;
    const params = new URLSearchParams({
      userId: profile.id,
      userName: profile.name ?? 'Користувач',
    });
    return `/messages?${params.toString()}`;
  }, [profile?.id, profile?.name, currentUserId]);

  useEffect(() => {
    let isMounted = true;
    const loadReviews = async () => {
      if (!profile?.id) return;
      if (profile.ratingSummary && profile.ratingSummary.latestReviews) {
        setReviews(profile.ratingSummary.latestReviews);
        return;
      }
      try {
        setIsLoadingReviews(true);
        setReviewsError(null);
        const summary = await ratingService.getSummary(profile.id);
        if (!isMounted) return;
        setReviews(summary.latestReviews ?? null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error && error.message ? error.message : getNetworkErrorMessage(error);
        setReviewsError(message);
      } finally {
        if (isMounted) setIsLoadingReviews(false);
      }
    };

    void loadReviews();

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const textualReviews = useMemo(() => {
    return (reviews ?? []).filter((r) => !!r.comment && String(r.comment).trim() !== '');
  }, [reviews]);

  const buildMessageLink = (listing: BaseListing) => {
    if (!listing.userId || listing.userId === currentUserId) return null;
    const params = new URLSearchParams({
      userId: listing.userId,
      announcementId: listing.id,
      userName: listing.userName,
      announcementTitle: listing.plantName,
    });
    return `/messages?${params.toString()}`;
  };

  const setExchangeState = (listingId: string, next: ExchangeActionState) => {
    setExchangeActions((prev) => ({
      ...prev,
      [listingId]: next,
    }));
  };

  const startExchange = async (listing: BaseListing) => {
    if (!listing.userId) return;
    setExchangeState(listing.id, { isLoading: true });
    try {
      await exchangeService.create({
        announcementId: listing.id,
        receiverId: listing.userId,
      });
      setExchangeState(listing.id, {
        isLoading: false,
        feedback: {
          tone: 'success',
          message: 'Обмін ініційовано. Перейдіть у розділ "Мої обміни".',
        },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setExchangeState(listing.id, {
        isLoading: false,
        feedback: { tone: 'error', message },
      });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        {isLoadingProfile ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо профіль...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-stretch gap-5">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[22px] bg-green-100">
                      {avatar ? (
                        <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-9 w-9 text-green-700" />
                      )}
                    </div>
                    <div className="flex h-24 min-w-0 flex-col justify-between py-1">
                      <div className="space-y-1">
                        <h1 className="text-clamp-1 text-2xl font-bold leading-tight text-slate-950">{displayName}</h1>
                        <p className="text-clamp-1 text-base font-medium leading-snug text-slate-600">{displayCity}</p>
                      </div>
                      <p className="text-clamp-1 text-sm leading-snug text-slate-400">Остання активність: {formatDate(profile.lastActiveAt)}</p>
                    </div>
                  </div>

                  <div className="ml-auto flex flex-col items-end gap-2 text-right">
                    {profile.emailVerified || profile.isEmailVerified ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Пошта підтверджена
                      </span>
                    ) : null}
                    {messageLink ? (
                      <Link
                        to={messageLink}
                        className="inline-flex h-11 min-w-[253px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#43ad48] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(46,125,50,0.18)] transition hover:from-[#256b2a] hover:to-[#3a9d40]"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Написати повідомлення
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Рейтинг користувача
                    </p>
                    {hasRatings ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-2xl font-bold text-slate-900">
                          {averageRating.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-600">
                          {ratingsCount} оцінок · {completedExchangesCount} обмінів
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">Поки що немає оцінок</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Реєстрація
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatDate(profile.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">Активних оголошень: {activeCount}</p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">Про користувача</h2>
                    <p className="mt-2 text-clamp-3 text-sm text-slate-600">{displayBio}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">Статистика оголошень</h2>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Активні</span>
                        <span className="font-semibold text-slate-900">{activeCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Всього</span>
                        <span className="font-semibold text-slate-900">{totalCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-950">Відгуки</h2>
                <span className="text-sm text-slate-500">{textualReviews ? textualReviews.length : '—'}</span>
              </div>

              {isLoadingReviews ? (
                <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
                  <p className="text-sm text-slate-600">Завантажуємо відгуки...</p>
                </div>
              ) : reviewsError ? (
                <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-8 text-center shadow-sm">
                  <p className="text-sm text-red-700">{reviewsError}</p>
                </div>
              ) : !textualReviews || textualReviews.length === 0 ? (
                <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
                  <p className="text-sm text-slate-600">Поки що немає відгуків.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {textualReviews.map((r) => (
                    <div key={r.id ?? `${r.createdAt}-${r.score}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                          {r.fromUser?.avatar ? (
                            <img src={r.fromUser.avatar} alt={r.fromUser.name} className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-5 w-5 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <Link to={r.fromUser?.id ? `/users/${r.fromUser.id}` : '#'} className="text-sm font-semibold text-slate-900">
                                {r.fromUser?.name || 'Користувач'}
                              </Link>
                              <div className="text-xs text-slate-500">{formatDate(r.createdAt)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Star
                                  key={i}
                                  className={`h-4 w-4 ${i <= (r.score ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                                />
                              ))}
                            </div>
                          </div>
                          {r.comment ? (
                            <p className="mt-2 text-sm text-slate-600">{r.comment}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-950">Оголошення користувача</h2>
                <span className="text-sm text-slate-500">{listings.length} оголошень</span>
              </div>

              {isLoadingListings ? (
                <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
                  <p className="text-sm text-slate-600">Завантажуємо оголошення...</p>
                </div>
              ) : listingsError ? (
                <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
                  <p className="text-sm text-red-700">{listingsError}</p>
                </div>
              ) : listings.length === 0 ? (
                <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
                  <p className="text-sm text-slate-600">Користувач ще не має оголошень.</p>
                </div>
              ) : (
                <div className={cardsGridClass}>
                  {listings.map((listing) => {
                    const exchangeState = exchangeActions[listing.id];
                    const canStartExchange = Boolean(listing.userId && listing.userId !== currentUserId);

                    return (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        typeLabel={typeLabels[listing.type]}
                        typeClass={typeClasses[listing.type]}
                        categoryLabel={categoryLabels[listing.category]}
                        sizeLabel={sizeLabels[listing.size]}
                        conditionLabel={conditionLabels[listing.condition]}
                        careLabel={careLabels[listing.careLevel]}
                        onClick={() => navigate(`/listings/${listing.id}`, { state: { listing } })}
                        messageLink={buildMessageLink(listing)}
                        exchangeAction={
                          canStartExchange
                            ? {
                                onClick: () => startExchange(listing),
                                disabled: exchangeState?.isLoading,
                                loading: exchangeState?.isLoading,
                                feedback: exchangeState?.feedback,
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

