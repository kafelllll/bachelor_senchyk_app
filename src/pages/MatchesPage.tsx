import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

import AppHeader from '../components/AppHeader';
import ListingCard from '../components/ListingCard';
import { announcementService, type Category, type Size, type Condition, type CareLevel } from '../api/announcementService';
import { exchangeService, type ExchangeHistory, type ExchangeItem } from '../api/exchangeService';
import { resolveRecommendations, type Recommendation, type ListingType } from '../utils/announcementMapping';
import { getNetworkErrorMessage } from '../utils/networkError';
import { authService } from '../api/authService';
import { useRatingsCache } from '../hooks/useRatingsCache';
import { STORAGE_KEYS, readJsonStorageValue, writeJsonStorageValue } from '../utils/storage';
import {
  RATINGS_UPDATED_EVENT,
  extractRatingsUpdatedDetail,
  type RatingsUpdatedDetail,
} from '../utils/ratingsEvents';
import { analyzeAnnouncementQuery } from '../utils/searchNlp';

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
  'mx-auto grid w-full max-w-[1452px] items-start justify-items-stretch gap-6 [grid-template-columns:minmax(0,1fr)] sm:justify-items-center sm:[grid-template-columns:repeat(auto-fit,minmax(min(345px,100%),345px))]';

type ListingTypeFilter = 'all' | 'offering' | 'looking-for';
type SortOption = 'best-match' | 'newest' | 'oldest' | 'name';

type ExchangeActionState = {
  isLoading: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

const resolveListingTypeFilter = (value: 'offer' | 'looking-for' | null): ListingTypeFilter => {
  if (value === 'offer') return 'offering';
  if (value === 'looking-for') return 'looking-for';
  return 'all';
};

const buildSearchText = (listing: Recommendation) => {
  return [listing.plantName, listing.description, listing.city, listing.district, listing.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const extractAnnouncementIdFromExchange = (exchange: ExchangeItem): string | null => {
  const nestedId = exchange.announcement?.id;
  if (typeof nestedId === 'string' && nestedId.trim()) return nestedId;

  const record = exchange as ExchangeItem & {
    announcementId?: unknown;
    announcement_id?: unknown;
    announcement?: { _id?: unknown };
  };
  const fallbackId = record.announcementId ?? record.announcement_id ?? record.announcement?._id;
  return typeof fallbackId === 'string' && fallbackId.trim() ? fallbackId : null;
};

const collectCompletedAnnouncementIds = (
  history: ExchangeHistory | null,
  mine: ExchangeItem[]
) => {
  const completedFromHistory = history?.completed ?? [];
  const completedFromMine = mine.filter((item) => item.status === 'completed');
  const unique = new Set<string>();

  [...completedFromHistory, ...completedFromMine].forEach((item) => {
    const announcementId = extractAnnouncementIdFromExchange(item);
    if (announcementId) unique.add(announcementId);
  });

  return [...unique];
};

const listingTypeFilters: ListingTypeFilter[] = ['all', 'offering', 'looking-for'];
const categoryFilters: Array<Category | 'all'> = ['all', 'indoor', 'succulent', 'other'];
const sizeFilters: Array<Size | 'all'> = ['all', 'small', 'medium', 'large'];
const conditionFilters: Array<Condition | 'all'> = ['all', 'healthy', 'needs-care'];
const careLevelFilters: Array<CareLevel | 'all'> = ['all', 'easy', 'medium', 'hard'];
const sortOptions: SortOption[] = ['best-match', 'newest', 'oldest', 'name'];

const readMatchesFilters = () => {
  return readJsonStorageValue<{
    searchQuery?: string;
    listingType?: ListingTypeFilter;
    selectedCategory?: Category | 'all';
    selectedSize?: Size | 'all';
    selectedCondition?: Condition | 'all';
    selectedCareLevel?: CareLevel | 'all';
    sortBy?: SortOption;
  }>(STORAGE_KEYS.matchesFilters);
};

export default function MatchesPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completedAnnouncementIds, setCompletedAnnouncementIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(authService.getUserId());
  const [searchQuery, setSearchQuery] = useState(() => readMatchesFilters()?.searchQuery ?? '');
  const [listingType, setListingType] = useState<ListingTypeFilter>(() => {
    const saved = readMatchesFilters()?.listingType;
    return saved && listingTypeFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>(() => {
    const saved = readMatchesFilters()?.selectedCategory;
    return saved && categoryFilters.includes(saved) ? saved : 'all';
  });
  const [selectedSize, setSelectedSize] = useState<Size | 'all'>(() => {
    const saved = readMatchesFilters()?.selectedSize;
    return saved && sizeFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCondition, setSelectedCondition] = useState<Condition | 'all'>(() => {
    const saved = readMatchesFilters()?.selectedCondition;
    return saved && conditionFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCareLevel, setSelectedCareLevel] = useState<CareLevel | 'all'>(() => {
    const saved = readMatchesFilters()?.selectedCareLevel;
    return saved && careLevelFilters.includes(saved) ? saved : 'all';
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = readMatchesFilters()?.sortBy;
    return saved && sortOptions.includes(saved) ? saved : 'best-match';
  });
  const [exchangeActions, setExchangeActions] = useState<Record<string, ExchangeActionState>>({});

  const nlp = useMemo(() => analyzeAnnouncementQuery(searchQuery), [searchQuery]);
  const inferredTypeFilter = resolveListingTypeFilter(nlp.offerType);
  const effectiveTypeFilter = listingType !== 'all' ? listingType : inferredTypeFilter;
  const effectiveCategory = selectedCategory !== 'all' ? selectedCategory : nlp.category ?? 'all';
  const effectiveSize = selectedSize !== 'all' ? selectedSize : nlp.size ?? 'all';
  const effectiveCondition = selectedCondition !== 'all' ? selectedCondition : nlp.condition ?? 'all';
  const effectiveCareLevel = selectedCareLevel !== 'all' ? selectedCareLevel : nlp.careLevel ?? 'all';
  const effectiveCity = nlp.city;
  const effectiveDistrict = nlp.district;
  const effectiveKeywords = nlp.keywords;

  const ratingUserIds = useMemo(() => matches.map((listing) => listing.userId), [matches]);
  const { ratingsByUserId } = useRatingsCache(ratingUserIds);

  const applySummaryToListing = (listing: Recommendation) => {
    const summary = listing.userId ? ratingsByUserId[listing.userId] : undefined;
    if (!summary) return listing;
    return {
      ...listing,
      userRating:
        typeof summary.averageRating === 'number'
          ? summary.averageRating
          : listing.userRating,
      ratingsCount:
        typeof summary.ratingsCount === 'number'
          ? summary.ratingsCount
          : listing.ratingsCount,
      completedExchanges:
        typeof summary.completedExchangesCount === 'number'
          ? summary.completedExchangesCount
          : listing.completedExchanges,
    };
  };

  const applySummaryFromEvent = (listing: Recommendation, detail: RatingsUpdatedDetail) => {
    if (!listing.userId || listing.userId !== detail.userId) return listing;
    return {
      ...listing,
      userRating:
        typeof detail.summary.averageRating === 'number'
          ? detail.summary.averageRating
          : listing.userRating,
      ratingsCount:
        typeof detail.summary.ratingsCount === 'number'
          ? detail.summary.ratingsCount
          : listing.ratingsCount,
      completedExchanges:
        typeof detail.summary.completedExchangesCount === 'number'
          ? detail.summary.completedExchangesCount
          : listing.completedExchanges,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const loadMatches = async (options?: { silent?: boolean }) => {
      const isSilent = options?.silent ?? false;
      try {
        if (!isSilent) {
          setIsLoading(true);
        }
        setLoadError(null);
        const response = await announcementService.listRecommendations();
        if (!isMounted) return;
        setMatches(resolveRecommendations(response));
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
        setMatches([]);
      } finally {
        if (isMounted && !isSilent) {
          setIsLoading(false);
        }
      }
    };

    const handleRatingsUpdated = (event: Event) => {
      const detail = extractRatingsUpdatedDetail(event);
      if (!detail) return;
      setMatches((prev) => prev.map((listing) => applySummaryFromEvent(listing, detail)));
    };

    loadMatches();
    window.addEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    };
  }, []);

  useEffect(() => {
    writeJsonStorageValue(STORAGE_KEYS.matchesFilters, {
      searchQuery,
      listingType,
      selectedCategory,
      selectedSize,
      selectedCondition,
      selectedCareLevel,
      sortBy,
    });
  }, [
    searchQuery,
    listingType,
    selectedCategory,
    selectedSize,
    selectedCondition,
    selectedCareLevel,
    sortBy,
  ]);

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

    const loadCompletedAnnouncements = async () => {
      if (!authService.getToken()) {
        if (isMounted) setCompletedAnnouncementIds([]);
        return;
      }

      const [historyResult, mineResult] = await Promise.allSettled([
        exchangeService.history(),
        exchangeService.listMine(),
      ]);

      if (!isMounted) return;

      const history =
        historyResult.status === 'fulfilled' ? historyResult.value : null;
      const mine =
        mineResult.status === 'fulfilled' && Array.isArray(mineResult.value)
          ? mineResult.value
          : [];

      setCompletedAnnouncementIds(collectCompletedAnnouncementIds(history, mine));
    };

    loadCompletedAnnouncements();

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

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

  const setExchangeState = (listingId: string, next: ExchangeActionState) => {
    setExchangeActions((prev) => ({
      ...prev,
      [listingId]: next,
    }));
  };

  const startExchange = async (listing: Recommendation) => {
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

  const applyFilters = (items: Recommendation[]) =>
    items.filter((listing) => {
      if (completedAnnouncementIds.includes(listing.id)) return false;
      if (listing.status !== 'active') return false;
      if (effectiveTypeFilter !== 'all' && listing.type !== effectiveTypeFilter) return false;
      if (effectiveCategory !== 'all' && listing.category !== effectiveCategory) return false;
      if (effectiveSize !== 'all' && listing.size !== effectiveSize) return false;
      if (effectiveCondition !== 'all' && listing.condition !== effectiveCondition) return false;
      if (effectiveCareLevel !== 'all' && listing.careLevel !== effectiveCareLevel) return false;
      if (effectiveCity) {
        const city = listing.city?.toLowerCase() ?? '';
        if (!city.includes(effectiveCity.toLowerCase())) return false;
      }
      if (effectiveDistrict) {
        const district = listing.district?.toLowerCase() ?? '';
        if (!district.includes(effectiveDistrict.toLowerCase())) return false;
      }
      if (effectiveKeywords.length > 0) {
        const text = buildSearchText(listing);
        if (!effectiveKeywords.some((keyword) => text.includes(keyword))) return false;
      }

      return true;
    });

  const filteredMatches = useMemo(() => {
    const result = applyFilters(matches);
    if (sortBy === 'best-match') {
      return [...result].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    }

    if (sortBy === 'oldest') {
      return [...result].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }

    if (sortBy === 'name') {
      return [...result].sort((a, b) => a.plantName.localeCompare(b.plantName));
    }

    return [...result].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [
    matches,
    effectiveTypeFilter,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    completedAnnouncementIds,
    effectiveKeywords,
    sortBy,
  ]);

  const activeFiltersCount = [
    listingType !== 'all',
    searchQuery !== '',
    selectedCategory !== 'all',
    selectedSize !== 'all',
    selectedCondition !== 'all',
    selectedCareLevel !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setListingType('all');
    setSelectedCategory('all');
    setSelectedSize('all');
    setSelectedCondition('all');
    setSelectedCareLevel('all');
    setSortBy('best-match');
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1452px]">
        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="relative xl:w-[340px] xl:min-w-[300px] xl:max-w-[360px]">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Пошук за назвою рослини..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-green-500"
            />
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <select
              value={listingType}
              onChange={(e) => setListingType(e.target.value as ListingTypeFilter)}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Тип: Всі</option>
              <option value="offering">Пропоную</option>
              <option value="looking-for">Шукаю</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as Category | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Категорія: Всі</option>
              <option value="indoor">Кімнатна</option>
              <option value="succulent">Сукулент</option>
              <option value="other">Інше</option>
            </select>

            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value as Size | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Розмір: Всі</option>
              <option value="small">Малий</option>
              <option value="medium">Середній</option>
              <option value="large">Великий</option>
            </select>

            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value as Condition | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Стан: Всі</option>
              <option value="healthy">Здорова</option>
              <option value="needs-care">Потребує догляду</option>
            </select>

            <select
              value={selectedCareLevel}
              onChange={(e) => setSelectedCareLevel(e.target.value as CareLevel | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Догляд: Всі</option>
              <option value="easy">Легкий догляд</option>
              <option value="medium">Середній догляд</option>
              <option value="hard">Складний догляд</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="best-match">Найкращий збіг</option>
              <option value="newest">Найновіші</option>
              <option value="oldest">Найстаріші</option>
              <option value="name">За назвою</option>
            </select>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-green-700 transition hover:bg-green-50"
              >
                Очистити фільтри ({activeFiltersCount})
              </button>
            </div>
          )}
        </section>

        <h2 className="mb-4 text-xl font-bold text-slate-950">Мої збіги</h2>

        {isLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо збіги...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Поки що немає рекомендованих оголошень.</p>
          </div>
        ) : (
          <div className={cardsGridClass}>
            {filteredMatches.map((listing) => {
              const displayListing = applySummaryToListing(listing);
              const exchangeState = exchangeActions[listing.id];
              const canStartExchange = Boolean(displayListing.userId && displayListing.userId !== currentUserId);

              return (
              <ListingCard
                key={displayListing.id}
                listing={displayListing}
                typeLabel={typeLabels[displayListing.type]}
                typeClass={typeClasses[displayListing.type]}
                categoryLabel={categoryLabels[displayListing.category]}
                sizeLabel={sizeLabels[displayListing.size]}
                conditionLabel={conditionLabels[displayListing.condition]}
                careLabel={careLabels[displayListing.careLevel]}
                showMatchBadge
                matchLevel={displayListing.matchLevel}
                layout="grid"
                variant="match"
                messageLink={buildMessageLink(displayListing)}
                exchangeAction={
                  canStartExchange
                    ? {
                        label: 'Запропонувати обмін',
                        onClick: () => startExchange(displayListing),
                        disabled: exchangeState?.isLoading,
                        loading: exchangeState?.isLoading,
                        feedback: exchangeState?.feedback,
                      }
                    : undefined
                }
                onClick={() => navigate(`/listings/${displayListing.id}`, { state: { listing: displayListing } })}
              />
              );
            })}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}


