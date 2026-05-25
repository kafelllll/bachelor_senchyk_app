import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  MapPin,
  Star,
  User,
  MessageCircle,
  Camera,
  Sparkles,
} from 'lucide-react';

import AppHeader from '../components/AppHeader';
import { Link, useNavigate } from 'react-router-dom';
import {
  announcementService,
  type Category,
  type Size,
  type Condition,
  type CareLevel,
} from '../api/announcementService';
import { exchangeService } from '../api/exchangeService';
import { authService } from '../api/authService';
import { resolveListings, resolveRecommendations, type BaseListing, type ListingType, type Recommendation } from '../utils/announcementMapping';
import { getNetworkErrorMessage } from '../utils/networkError';
import { useRatingsCache } from '../hooks/useRatingsCache';
import { formatRatingLine } from '../utils/ratingsFormat';
import {
  STORAGE_KEYS,
  readJsonStorageValue,
  readStorageValue,
  writeJsonStorageValue,
  writeStorageValue,
} from '../utils/storage';
import {
  RATINGS_UPDATED_EVENT,
  extractRatingsUpdatedDetail,
  type RatingsUpdatedDetail,
} from '../utils/ratingsEvents';
import { analyzeAnnouncementQuery } from '../utils/searchNlp';

type ListingTypeFilter = 'all' | 'offering' | 'looking-for';
type SortOption = 'best-match' | 'newest' | 'oldest' | 'name';
type Listing = BaseListing;

type ExchangeActionState = {
  isLoading: boolean;
  feedback?: { tone: 'success' | 'error'; message: string };
};

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

const listingImageClass = 'relative h-[150px] overflow-hidden';
const cardsGridClass =
  'mx-auto grid w-full max-w-[1452px] items-start justify-items-stretch gap-6 [grid-template-columns:minmax(0,1fr)] sm:justify-items-center sm:[grid-template-columns:repeat(auto-fit,minmax(min(345px,100%),345px))]';

const resolveOfferTypeParam = (value: ListingTypeFilter) => {
  if (value === 'offering') return 'offer';
  if (value === 'looking-for') return 'looking-for';
  return undefined;
};

const resolveListingTypeFilter = (value: 'offer' | 'looking-for' | null): ListingTypeFilter => {
  if (value === 'offer') return 'offering';
  if (value === 'looking-for') return 'looking-for';
  return 'all';
};

const buildSearchText = (listing: Listing) => {
  return [listing.plantName, listing.description, listing.city, listing.district, listing.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const listingTypeFilters: ListingTypeFilter[] = ['all', 'offering', 'looking-for'];
const categoryFilters: Array<Category | 'all'> = ['all', 'indoor', 'succulent', 'other'];
const sizeFilters: Array<Size | 'all'> = ['all', 'small', 'medium', 'large'];
const conditionFilters: Array<Condition | 'all'> = ['all', 'healthy', 'needs-care'];
const careLevelFilters: Array<CareLevel | 'all'> = ['all', 'easy', 'medium', 'hard'];

const readListingsFilters = () => {
  return readJsonStorageValue<{
    searchQuery?: string;
    listingType?: ListingTypeFilter;
    selectedCategory?: Category | 'all';
    selectedSize?: Size | 'all';
    selectedCondition?: Condition | 'all';
    selectedCareLevel?: CareLevel | 'all';
  }>(STORAGE_KEYS.listingsFilters);
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showAiTip, setShowAiTip] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => readListingsFilters()?.searchQuery ?? '');
  const [listingType, setListingType] = useState<ListingTypeFilter>(() => {
    const saved = readListingsFilters()?.listingType;
    return saved && listingTypeFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>(() => {
    const saved = readListingsFilters()?.selectedCategory;
    return saved && categoryFilters.includes(saved) ? saved : 'all';
  });
  const [selectedSize, setSelectedSize] = useState<Size | 'all'>(() => {
    const saved = readListingsFilters()?.selectedSize;
    return saved && sizeFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCondition, setSelectedCondition] = useState<Condition | 'all'>(() => {
    const saved = readListingsFilters()?.selectedCondition;
    return saved && conditionFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCareLevel, setSelectedCareLevel] = useState<CareLevel | 'all'>(() => {
    const saved = readListingsFilters()?.selectedCareLevel;
    return saved && careLevelFilters.includes(saved) ? saved : 'all';
  });
  const [sortBy, setSortBy] = useState<SortOption>('best-match');
  const [exchangeActions, setExchangeActions] = useState<Record<string, ExchangeActionState>>({});
  const lastSearchActiveRef = useRef(false);
  const hasLoadedListingsRef = useRef(false);
  const aiTipDismissKeyRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const ratingUserIds = useMemo(() => {
    const ids = listings.map((listing) => listing.userId).concat(
      recommendations.map((listing) => listing.userId)
    );
    return ids;
  }, [listings, recommendations]);

  const { ratingsByUserId } = useRatingsCache(ratingUserIds);

  const applySummaryToListing = (listing: Listing) => {
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

  const applySummaryFromEvent = <T extends Listing>(listing: T, detail: RatingsUpdatedDetail): T => {
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
    } as T;
  };

  const buildMessageLink = (listing: Listing) => {
    if (!listing.userId || listing.userId === currentUserId) return null;
    const params = new URLSearchParams({
      userId: listing.userId,
      announcementId: listing.id,
      userName: listing.userName,
      announcementTitle: listing.plantName,
    });
    return `/messages?${params.toString()}`;
  };

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const me = await authService.me();
        if (isMounted) {
          setCurrentUserId(me.id ?? null);
          if (me.id) {
            const dismissKey = `plantmatch.ai-tip.dismissed.${me.id}`;
            aiTipDismissKeyRef.current = dismissKey;
            const createdAt = me.createdAt ? new Date(me.createdAt).getTime() : NaN;
            const isNewUser = Number.isFinite(createdAt)
              ? Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000
              : false;
            const isDismissed = Boolean(readStorageValue(dismissKey));
            setShowAiTip(isNewUser && !isDismissed);
          }
        }
      } catch {
        if (isMounted) {
          setCurrentUserId(null);
          setShowAiTip(false);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    writeJsonStorageValue(STORAGE_KEYS.listingsFilters, {
      searchQuery,
      listingType,
      selectedCategory,
      selectedSize,
      selectedCondition,
      selectedCareLevel,
    });
  }, [
    searchQuery,
    listingType,
    selectedCategory,
    selectedSize,
    selectedCondition,
    selectedCareLevel,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadRecommendations = async () => {
      try {
        setRecommendationsLoading(true);
        setRecommendationsError(null);
        const result = await announcementService.listRecommendations();
        if (!isMounted) return;
        setRecommendations(resolveRecommendations(result));
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setRecommendationsError(message);
        setRecommendations([]);
      } finally {
        if (isMounted) {
          setRecommendationsLoading(false);
        }
      }
    };

    loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, []);

  const nlp = useMemo(() => analyzeAnnouncementQuery(searchQuery), [searchQuery]);
  const inferredListingType = resolveListingTypeFilter(nlp.offerType);
  const effectiveListingType = listingType !== 'all' ? listingType : inferredListingType;
  const effectiveOfferType = resolveOfferTypeParam(effectiveListingType);
  const effectiveCategory = selectedCategory !== 'all' ? selectedCategory : nlp.category ?? 'all';
  const effectiveSize = selectedSize !== 'all' ? selectedSize : nlp.size ?? 'all';
  const effectiveCondition = selectedCondition !== 'all' ? selectedCondition : nlp.condition ?? 'all';
  const effectiveCareLevel = selectedCareLevel !== 'all' ? selectedCareLevel : nlp.careLevel ?? 'all';
  const effectiveCity = nlp.city;
  const effectiveDistrict = nlp.district;
  const effectiveStatus = nlp.status;
  const effectiveKeywords = nlp.keywords;
  const normalizedQuery = nlp.normalizedQuery;

  useEffect(() => {
    let isMounted = true;

    const loadListings = async () => {
      const shouldSearch = Boolean(
        normalizedQuery ||
          effectiveOfferType ||
          effectiveCategory !== 'all' ||
          effectiveSize !== 'all' ||
          effectiveCondition !== 'all' ||
          effectiveCareLevel !== 'all' ||
          effectiveCity ||
          effectiveDistrict ||
          effectiveStatus
      );
      const shouldReloadAll =
        !shouldSearch && (lastSearchActiveRef.current || !hasLoadedListingsRef.current);

      if (!shouldSearch && !shouldReloadAll) return;

      try {
        setIsLoading(true);
        setLoadError(null);

        if (shouldSearch) {
          lastSearchActiveRef.current = true;
          const result = await announcementService.search({
            query: normalizedQuery ?? undefined,
            offerType: effectiveOfferType ?? undefined,
            category: effectiveCategory !== 'all' ? effectiveCategory : undefined,
            size: effectiveSize !== 'all' ? effectiveSize : undefined,
            condition: effectiveCondition !== 'all' ? effectiveCondition : undefined,
            careLevel: effectiveCareLevel !== 'all' ? effectiveCareLevel : undefined,
            status: effectiveStatus ?? undefined,
            city: effectiveCity ?? undefined,
            district: effectiveDistrict ?? undefined,
          });
          if (!isMounted) return;
          setListings(resolveListings(result));
        } else {
          lastSearchActiveRef.current = false;
          const result = await announcementService.list();
          if (!isMounted) return;
          setListings(resolveListings(result));
        }
        hasLoadedListingsRef.current = true;
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
        setListings([]);
        hasLoadedListingsRef.current = true;
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadListings();

    return () => {
      isMounted = false;
    };
  }, [
    normalizedQuery,
    effectiveOfferType,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    effectiveStatus,
  ]);

  useEffect(() => {
    const handleRatingsUpdated = (event: Event) => {
      const detail = extractRatingsUpdatedDetail(event);
      if (!detail) return;
      setListings((prev) => prev.map((listing) => applySummaryFromEvent(listing, detail)));
      setRecommendations((prev) => prev.map((listing) => applySummaryFromEvent(listing, detail)));
    };

    window.addEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    return () => {
      window.removeEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    };
  }, []);

  const otherListings = useMemo(() => {
    if (!currentUserId) return listings;
    return listings.filter((listing) =>
      listing.userId ? listing.userId !== currentUserId : true
    );
  }, [currentUserId, listings]);

  const recommendedListings = useMemo(() => {
    const filtered = recommendations.filter((item) =>
      currentUserId ? item.userId !== currentUserId : true
    );
    return [...filtered].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }, [currentUserId, recommendations]);

  const applyFilters = (items: Listing[]) =>
    items.filter((listing) => {
      if (listing.status !== 'active') return false;
      if (effectiveListingType !== 'all' && listing.type !== effectiveListingType) return false;
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

  const filteredListings = useMemo(() => {
    const result = applyFilters(otherListings);

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
    effectiveListingType,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    effectiveKeywords,
    sortBy,
    otherListings,
  ]);

  const filteredRecommendations = useMemo(() => {
    const result = applyFilters(recommendedListings);

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
    effectiveListingType,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    effectiveKeywords,
    sortBy,
    recommendedListings,
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

  const setExchangeState = (listingId: string, next: ExchangeActionState) => {
    setExchangeActions((prev) => ({
      ...prev,
      [listingId]: next,
    }));
  };

  const startExchange = async (listing: Listing) => {
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
          message: 'Обмін ініційовано. Перейдіть у розділ “Мої обміни”.',
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
              <option value="easy">Легкий</option>
              <option value="medium">Середній</option>
              <option value="hard">Складний</option>
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

        {showAiTip ? (
          <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <Camera className="h-5 w-5 text-green-700" />
              <p className="text-sm text-slate-700">
                Не впевнені в назві рослини? Використайте AI при створенні оголошення
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/create-listing"
                className="rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] transition hover:opacity-95"
              >
                Спробувати AI
              </Link>
              <button
                type="button"
                onClick={() => {
                  const key = aiTipDismissKeyRef.current;
                  if (key) {
                    writeStorageValue(key, '1');
                  }
                  setShowAiTip(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-green-100 hover:text-green-700"
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
          </section>
        ) : null}

        <section className="mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">Рекомендовані оголошення</h2>
          </div>

          {recommendationsLoading ? (
            <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
              <p className="text-sm text-slate-600">Завантажуємо рекомендації...</p>
            </div>
          ) : recommendationsError ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-10 text-center shadow-sm">
              <p className="text-sm text-red-700">{recommendationsError}</p>
            </div>
          ) : filteredRecommendations.length === 0 ? (
            <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
              <p className="text-sm text-slate-600">Поки що немає рекомендацій для вас.</p>
            </div>
          ) : (
            <div className={cardsGridClass}>
              {filteredRecommendations.map((listing) => {
                const displayListing = applySummaryToListing(listing);
                const messageLink = buildMessageLink(displayListing);
                const showMatchScore = typeof listing.matchScore === 'number';
                const isInactive = displayListing.status !== 'active';
                const canStartExchange = Boolean(
                  !isInactive && displayListing.userId && displayListing.userId !== currentUserId
                );
                const exchangeState = exchangeActions[listing.id];
                const safeMessageLink = isInactive ? null : messageLink;

                return (
                    <article
                      key={listing.id}
                      onClick={() => navigate(`/listings/${displayListing.id}`, { state: { listing: displayListing } })}
                      className="group self-start flex min-w-0 w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:max-w-[345px]"
                    >
                      <div className={listingImageClass}>
                        <img
                          src={listing.image}
                          alt={listing.plantName}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        {showMatchScore ? (
                          <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-yellow-400/80 px-3.5 py-2 text-sm font-semibold text-slate-900">
                            <Sparkles className="h-4.5 w-4.5" />
                            {Math.round(listing.matchScore ?? 0)}%
                          </div>
                        ) : null}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col p-[14px]">
                        <div className="mb-2.5 flex items-start justify-between gap-3">
                          <h3 className="min-w-0 flex-1 text-clamp-1 text-[17px] font-bold leading-tight text-slate-950">
                            {displayListing.plantName}
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
                            {categoryLabels[displayListing.category]}
                          </span>
                          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {sizeLabels[displayListing.size]}
                          </span>
                          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {conditionLabels[displayListing.condition]}
                          </span>
                          <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {careLabels[displayListing.careLevel]}
                          </span>
                        </div>

                        <div className="mb-2.5 space-y-2 text-sm text-slate-500">
                          <div className="flex min-w-0 items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span className="min-w-0 flex-1 text-clamp-1">{displayListing.location}</span>
                          </div>
                        </div>

                        <div className="mt-auto flex flex-col border-t border-slate-100 pt-2.5">
                          <Link
                            to={displayListing.userId ? `/users/${displayListing.userId}` : '#'}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!displayListing.userId) event.preventDefault();
                            }}
                            className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
                                {displayListing.userAvatar ? (
                                  <img src={displayListing.userAvatar} alt={displayListing.userName} className="h-full w-full object-cover" />
                                ) : (
                                  <User className="h-4 w-4 text-green-700" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                                  {displayListing.userName}
                                </p>
                                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                  <span className="min-w-0 text-clamp-1">
                                    {formatRatingLine({
                                      averageRating: displayListing.userRating,
                                      ratingsCount: displayListing.ratingsCount,
                                      completedExchangesCount: displayListing.completedExchanges,
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Link>

                          {safeMessageLink ? (
                            <Link
                              to={safeMessageLink}
                              onClick={(event) => event.stopPropagation()}
                              className="message-action-link order-3 mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-700 px-4 py-2.5 text-sm font-semibold text-green-700 transition"
                            >
                              <MessageCircle className="h-4 w-4" />
                              Написати повідомлення
                            </Link>
                          ) : null}

                          {isInactive ? (
                            <p className="mt-3 text-xs font-semibold text-slate-500">
                              Оголошення неактивне
                            </p>
                          ) : null}

                          {canStartExchange ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                startExchange(displayListing);
                              }}
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
        </section>

        <section className="pb-10">
          <h2 className="mb-4 text-xl font-bold text-slate-950">Всі оголошення</h2>

          {isLoading ? (
            <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-slate-600">Завантажуємо оголошення...</p>
            </div>
          ) : loadError ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
              <p className="text-sm text-red-700">{loadError}</p>
            </div>
          ) : otherListings.length === 0 ? (
            <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Search className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-slate-950">Оголошень ще немає</h3>
              <p className="text-sm text-slate-600">
                Поки що немає оголошень від інших користувачів.
              </p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Search className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-slate-950">Оголошень не знайдено</h3>
              <p className="mb-5 text-sm text-slate-600">
                Не знайдено результатів за обраними фільтрами. Спробуйте інші критерії пошуку.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] transition hover:opacity-95"
              >
                Очистити фільтри
              </button>
            </div>
          ) : (
            <div className={cardsGridClass}>
              {filteredListings.map((listing) => {
                const displayListing = applySummaryToListing(listing);
                const messageLink = buildMessageLink(displayListing);
                const isInactive = displayListing.status !== 'active';
                const canStartExchange = Boolean(
                  !isInactive && displayListing.userId && displayListing.userId !== currentUserId
                );
                const exchangeState = exchangeActions[listing.id];
                const safeMessageLink = isInactive ? null : messageLink;

                return (
                  <article
                    key={displayListing.id}
                    onClick={() => navigate(`/listings/${displayListing.id}`, { state: { listing: displayListing } })}
                    className="group self-start flex min-w-0 w-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:max-w-[345px]"
                  >
                  <div className={listingImageClass}>
                    <img
                      src={displayListing.image}
                      alt={displayListing.plantName}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col p-[14px]">
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 text-clamp-1 text-[17px] font-bold leading-tight text-slate-950">
                        {displayListing.plantName}
                      </h3>
                      <span
                        className={`shrink-0 max-w-[45%] text-clamp-1 rounded-full px-3 py-1 text-xs font-semibold ${
                          typeClasses[displayListing.type]
                        }`}
                      >
                        {typeLabels[displayListing.type]}
                      </span>
                    </div>

                    <div className="mb-2.5 flex flex-wrap gap-2">
                      <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {categoryLabels[displayListing.category]}
                      </span>
                      <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {sizeLabels[displayListing.size]}
                      </span>
                      <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {conditionLabels[displayListing.condition]}
                      </span>
                      <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {careLabels[displayListing.careLevel]}
                      </span>
                    </div>

                    <div className="mb-2.5 space-y-2 text-sm text-slate-500">
                      <div className="flex min-w-0 items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span className="min-w-0 flex-1 text-clamp-1">{displayListing.location}</span>
                      </div>
                    </div>

                    <div className="mt-auto flex flex-col border-t border-slate-100 pt-2.5">
                      <Link
                        to={displayListing.userId ? `/users/${displayListing.userId}` : '#'}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!displayListing.userId) event.preventDefault();
                        }}
                        className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
                            {displayListing.userAvatar ? (
                              <img src={displayListing.userAvatar} alt={displayListing.userName} className="h-full w-full object-cover" />
                            ) : (
                              <User className="h-4 w-4 text-green-700" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                              {displayListing.userName}
                            </p>
                            <div className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="min-w-0 text-clamp-1">
                                {formatRatingLine({
                                  averageRating: displayListing.userRating,
                                  ratingsCount: displayListing.ratingsCount,
                                  completedExchangesCount: displayListing.completedExchanges,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                      {safeMessageLink ? (
                        <Link
                          to={safeMessageLink}
                          onClick={(event) => event.stopPropagation()}
                          className="message-action-link order-3 mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-green-700 px-4 py-2.5 text-sm font-semibold text-green-700 transition"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Написати повідомлення
                        </Link>
                      ) : null}

                      {isInactive ? (
                        <p className="mt-3 text-xs font-semibold text-slate-500">
                          Оголошення неактивне
                        </p>
                      ) : null}

                      {canStartExchange ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startExchange(listing);
                          }}
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
        </section>
        </div>
      </main>
    </div>
  );
}
