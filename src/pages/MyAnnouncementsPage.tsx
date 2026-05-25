import { useEffect, useMemo, useState } from 'react';
import { Calendar, MapPin, Search, Eye, Pencil, Trash2, X, ChevronLeft, ChevronRight, Gauge } from 'lucide-react';

import AppHeader from '../components/AppHeader';
import { announcementService, type Category, type Size, type Condition, type CareLevel } from '../api/announcementService';
import { authService } from '../api/authService';
import { Link, useNavigate } from 'react-router-dom';
import { resolveListings, type BaseListing, type ListingType, type ListingStatus } from '../utils/announcementMapping';
import { getNetworkErrorMessage } from '../utils/networkError';
import { analyzeAnnouncementQuery } from '../utils/searchNlp';

type Listing = BaseListing;

type ListingTypeFilter = 'all' | 'offering' | 'looking-for';
type SortOption = 'newest' | 'oldest' | 'name';

const statusLabels: Record<ListingStatus, string> = {
  active: 'Активне',
  inactive: 'Неактивне',
  'in-progress': 'У процесі',
  completed: 'Завершено',
};

const statusClasses: Record<ListingStatus, string> = {
  active: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-200 text-slate-600',
  'in-progress': 'bg-amber-500 text-white',
  completed: 'bg-gray-400 text-white',
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

const formatPlantName = (value: string): string => {
  const trimmed = value.trim();
  const bracketIndex = trimmed.indexOf('(');
  if (bracketIndex === -1) return trimmed;
  return trimmed.slice(0, bracketIndex).trim();
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

const cardsGridClass =
  'mx-auto grid w-full max-w-[1452px] items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(345px,100%),345px))]';

export default function MyAnnouncementsPage() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ListingTypeFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedSize, setSelectedSize] = useState<Size | 'all'>('all');
  const [selectedCondition, setSelectedCondition] = useState<Condition | 'all'>('all');
  const [selectedCareLevel, setSelectedCareLevel] = useState<CareLevel | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Listing | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const nlp = useMemo(() => analyzeAnnouncementQuery(searchQuery), [searchQuery]);
  const inferredTypeFilter = resolveListingTypeFilter(nlp.offerType);
  const effectiveTypeFilter = typeFilter !== 'all' ? typeFilter : inferredTypeFilter;
  const effectiveCategory = selectedCategory !== 'all' ? selectedCategory : nlp.category ?? 'all';
  const effectiveSize = selectedSize !== 'all' ? selectedSize : nlp.size ?? 'all';
  const effectiveCondition = selectedCondition !== 'all' ? selectedCondition : nlp.condition ?? 'all';
  const effectiveCareLevel = selectedCareLevel !== 'all' ? selectedCareLevel : nlp.careLevel ?? 'all';
  const effectiveCity = nlp.city;
  const effectiveDistrict = nlp.district;
  const effectiveKeywords = nlp.keywords;

  useEffect(() => {
    let isMounted = true;

    const loadAnnouncements = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const response = await announcementService.listMine();
        if (!isMounted) return;
        setListings(resolveListings(response));
      } catch (err) {
        if (!isMounted) return;
        let message = 'Не вдалося отримати оголошення.';
        if (err instanceof Error && err.message) {
          message = err.message;
        } else {
          message = getNetworkErrorMessage(err);
        }
        setLoadError(message);
        setListings([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAnnouncements();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedListing) {
      setSelectedImageIndex(0);
    }
  }, [selectedListing?.id]);

  const filteredListings = useMemo(() => {
    let result = listings;

    if (effectiveTypeFilter !== 'all') {
      result = result.filter((listing) => listing.type === effectiveTypeFilter);
    }

    if (effectiveCategory !== 'all') {
      result = result.filter((listing) => listing.category === effectiveCategory);
    }

    if (effectiveSize !== 'all') {
      result = result.filter((listing) => listing.size === effectiveSize);
    }

    if (effectiveCondition !== 'all') {
      result = result.filter((listing) => listing.condition === effectiveCondition);
    }

    if (effectiveCareLevel !== 'all') {
      result = result.filter((listing) => listing.careLevel === effectiveCareLevel);
    }

    if (effectiveCity) {
      result = result.filter((listing) =>
        (listing.city ?? '').toLowerCase().includes(effectiveCity.toLowerCase())
      );
    }

    if (effectiveDistrict) {
      result = result.filter((listing) =>
        (listing.district ?? '').toLowerCase().includes(effectiveDistrict.toLowerCase())
      );
    }

    if (effectiveKeywords.length > 0) {
      result = result.filter((listing) => {
        const text = buildSearchText(listing);
        return effectiveKeywords.some((keyword) => text.includes(keyword));
      });
    }

    if (sortBy === 'name') {
      return [...result].sort((a, b) => a.plantName.localeCompare(b.plantName));
    }

    if (sortBy === 'oldest') {
      return [...result].sort(
        (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
      );
    }

    return [...result].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
    );
  }, [
    listings,
    effectiveTypeFilter,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    effectiveKeywords,
    sortBy,
  ]);

  const hasListings = useMemo(() => listings.length > 0, [listings.length]);
  const activeFiltersCount = [
    typeFilter !== 'all',
    searchQuery !== '',
    selectedCategory !== 'all',
    selectedSize !== 'all',
    selectedCondition !== 'all',
    selectedCareLevel !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setSelectedCategory('all');
    setSelectedSize('all');
    setSelectedCondition('all');
    setSelectedCareLevel('all');
    setSortBy('newest');
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Видалити оголошення?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Ви дійсно хочете видалити оголошення “{formatPlantName(pendingDelete.plantName)}”?
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    // Перевірка власності перед видаленням
                    const currentUserId = authService.getUserId();
                    if (pendingDelete.userId && currentUserId && pendingDelete.userId !== currentUserId) {
                      setActionMessage('Ви не можете видалити оголошення іншого користувача.');
                      setPendingDelete(null);
                      return;
                    }

                    await announcementService.remove(pendingDelete.id);
                    setListings((prev) => prev.filter((item) => item.id !== pendingDelete.id));
                    setActionMessage('Оголошення успішно видалено.');
                  } catch (err) {
                    let message = 'Не вдалося видалити оголошення.';
                    if (err instanceof Error && err.message) {
                      message = err.message;
                    } else {
                      message = getNetworkErrorMessage(err);
                    }
                    setActionMessage(message);
                  } finally {
                    setPendingDelete(null);
                  }
                }}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-green-500"
            />
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ListingTypeFilter)}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Тип: Всі</option>
              <option value="offering">Пропоную</option>
              <option value="looking-for">Шукаю</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value as Category | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Категорія: Всі</option>
              <option value="indoor">Кімнатна</option>
              <option value="succulent">Сукулент</option>
              <option value="other">Інше</option>
            </select>

            <select
              value={selectedSize}
              onChange={(event) => setSelectedSize(event.target.value as Size | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Розмір: Всі</option>
              <option value="small">Малий</option>
              <option value="medium">Середній</option>
              <option value="large">Великий</option>
            </select>

            <select
              value={selectedCondition}
              onChange={(event) => setSelectedCondition(event.target.value as Condition | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Стан: Всі</option>
              <option value="healthy">Здорова</option>
              <option value="needs-care">Потребує догляду</option>
            </select>

            <select
              value={selectedCareLevel}
              onChange={(event) => setSelectedCareLevel(event.target.value as CareLevel | 'all')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Догляд: Всі</option>
              <option value="easy">Легкий догляд</option>
              <option value="medium">Середній догляд</option>
              <option value="hard">Складний догляд</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
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

        {actionMessage ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {actionMessage}
          </div>
        ) : null}
        <h2 className="mb-4 text-xl font-bold text-slate-950">Мої оголошення</h2>
        {isLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо оголошення...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : !hasListings ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Search className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-950">Оголошень ще немає</h3>
            <p className="text-sm text-slate-600">Поки що ви не створили жодного оголошення.</p>
            <Link
              to="/create-listing"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)]"
            >
              Створити перше оголошення
            </Link>
          </div>
        ) : (
          <section className="pb-10">

            {filteredListings.length === 0 ? (
              <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                  <Search className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-slate-950">Оголошень не знайдено</h3>
                <p className="mb-5 text-sm text-slate-600">
                  Не знайдено результатів за обраними фільтрами. Спробуйте інші критерії.
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
                  const isInactive = listing.status === 'inactive';
                  return (
                  <article
                    key={listing.id}
                    onClick={() => setSelectedListing(listing)}
                    className={`group self-start flex min-w-0 w-full max-w-[345px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
                      isInactive ? 'opacity-70' : ''
                    }`}
                  >
                      <div className="relative h-[150px] overflow-hidden">
                        {listing.image ? (
                          <img
                            src={listing.image}
                            alt={listing.plantName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                            Фото відсутнє
                          </div>
                        )}
                        <span
                          className={`absolute left-4 top-4 max-w-[calc(100%-5.5rem)] text-clamp-1 rounded-full px-3 py-1.5 text-xs font-semibold ${statusClasses[listing.status]}`}
                        >
                          {statusLabels[listing.status]}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedListing(listing);
                          }}
                          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/45 text-slate-700 shadow-sm transition hover:bg-white"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col p-[14px]">
                        <div className="mb-2.5 flex items-start justify-between gap-3">
                          <h3 className="min-w-0 flex-1 text-clamp-1 text-[17px] font-bold leading-tight text-slate-950">
                            {formatPlantName(listing.plantName)}
                          </h3>
                          <span
                            className={`shrink-0 max-w-[45%] text-clamp-1 rounded-full px-3 py-1 text-xs font-semibold ${typeClasses[listing.type]}`}
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
                            <MapPin className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 text-clamp-1">{listing.location}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 text-clamp-1">{listing.postedDate}</span>
                          </div>
                        </div>

                        <div className="mt-auto grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/my-announcements/${listing.id}/matches`);
                            }}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <Gauge className="h-4 w-4" />
                            Переглянути рекомендації
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/my-announcements/${listing.id}/edit`, {
                                state: { listing },
                              });
                            }}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-slate-600 hover:bg-gray-50"
                          >
                            <Pencil className="h-4 w-4" />
                            Редагувати
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingDelete(listing);
                            }}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                          >
                            <Trash2 className="h-4 w-4" />
                            Видалити
                          </button>
                        </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
        </div>
      </main>

      {selectedListing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedListing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition hover:bg-slate-100"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>

              <div className="relative h-72 overflow-hidden">
                {selectedListing.image ? (
                  <img
                    src={selectedListing.images[selectedImageIndex] || selectedListing.image}
                    alt={selectedListing.plantName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                    Фото відсутнє
                  </div>
                )}
                {selectedListing.images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImageIndex((prev) =>
                          prev === 0 ? selectedListing.images.length - 1 : prev - 1
                        )
                      }
                      className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImageIndex((prev) =>
                          prev === selectedListing.images.length - 1 ? 0 : prev + 1
                        )
                      }
                      className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}
                <span
                  className={`absolute left-4 top-4 max-w-[calc(100%-2rem)] text-clamp-1 rounded-full px-4 py-2 text-xs font-semibold ${statusClasses[selectedListing.status]}`}
                >
                  {statusLabels[selectedListing.status]}
                </span>
              </div>

              <div className="p-6">
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="mb-2 text-clamp-1 text-2xl font-bold text-slate-950">
                      {formatPlantName(selectedListing.plantName)}
                    </h2>
                    <span
                      className={`max-w-full text-clamp-1 rounded-full px-4 py-1.5 text-xs font-semibold ${typeClasses[selectedListing.type]}`}
                    >
                      {typeLabels[selectedListing.type]}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                    Характеристики
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {categoryLabels[selectedListing.category]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {sizeLabels[selectedListing.size]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {conditionLabels[selectedListing.condition]}
                    </span>
                    <span className="max-w-full text-clamp-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                      {careLabels[selectedListing.careLevel]}
                    </span>
                  </div>
                </div>

                {(selectedListing.wateringFreq || selectedListing.lightReqs || selectedListing.humidity || selectedListing.toxicity || selectedListing.growthRate || selectedListing.hasOffspring) && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                      Умови вирощування
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {selectedListing.wateringFreq && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Частота поливу</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            {selectedListing.wateringFreq === 'rare' && 'Рідко'}
                            {selectedListing.wateringFreq === 'moderate' && 'Помірно'}
                            {selectedListing.wateringFreq === 'frequent' && 'Часто'}
                          </p>
                        </div>
                      )}
                      {selectedListing.lightReqs && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Вимоги до світла</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            {selectedListing.lightReqs === 'bright' && 'Яскраве світло'}
                            {selectedListing.lightReqs === 'partial' && 'Частково тінь'}
                            {selectedListing.lightReqs === 'shade' && 'Тінь'}
                          </p>
                        </div>
                      )}
                      {selectedListing.humidity && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Вологість повітря</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            {selectedListing.humidity === 'low' && 'Низька'}
                            {selectedListing.humidity === 'medium' && 'Середня'}
                            {selectedListing.humidity === 'high' && 'Висока'}
                          </p>
                        </div>
                      )}
                      {selectedListing.toxicity && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Отруйність</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            {selectedListing.toxicity === 'non-toxic' && 'Нетоксична'}
                            {selectedListing.toxicity === 'slightly-toxic' && 'Слабко токсична'}
                            {selectedListing.toxicity === 'toxic' && 'Токсична'}
                          </p>
                        </div>
                      )}
                      {selectedListing.growthRate && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Швидкість росту</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            {selectedListing.growthRate === 'slow' && 'Повільна'}
                            {selectedListing.growthRate === 'moderate' && 'Помірна'}
                            {selectedListing.growthRate === 'fast' && 'Швидка'}
                          </p>
                        </div>
                      )}
                      {selectedListing.hasOffspring && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                          <p className="text-xs text-slate-500">Дітки</p>
                          <p className="text-clamp-1 text-sm font-medium text-slate-900">
                            Можна розділити
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(selectedListing.pestFree || selectedListing.readyToExchange) && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                      Додаткові опції
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedListing.pestFree && (
                        <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                          ✓ Без шкідників
                        </span>
                      )}
                      {selectedListing.readyToExchange && (
                        <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                          ✓ Готовий до обміну
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <p className="mb-5 text-clamp-3 text-sm leading-6 text-slate-700">
                  {selectedListing.description || 'Опис відсутній.'}
                </p>

                <div className="mb-5 grid gap-4 md:grid-cols-2">
                  <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <MapPin className="h-5 w-5 shrink-0 text-green-700" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Локація</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <Calendar className="h-5 w-5 shrink-0 text-green-700" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500">Опубліковано</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.postedDate}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6 border-t border-slate-200 pt-6">
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                    Додаткова інформація
                  </h3>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Загальна назва</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.commonName || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Наукова назва</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.scientificName || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Рід</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.genus || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Родина</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.family || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Місто</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.city || '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Район</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.district || '—'}
                      </p>
                    </div>
                  </div>

                  {selectedListing.additionalTags && selectedListing.additionalTags.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Додаткові теги
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedListing.additionalTags.map((tag) => (
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
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.pestFree ? 'Так' : 'Ні'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs text-slate-500">Готовність до обміну</p>
                      <p className="text-clamp-1 text-sm font-medium text-slate-900">
                        {selectedListing.readyToExchange ? 'Так' : 'Ні'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}




