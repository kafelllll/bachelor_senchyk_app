import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, MapPin, Search, Star, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';

import AppHeader from '../components/AppHeader';
import { exchangeService, type ExchangeAnnouncement, type ExchangeHistory, type ExchangeItem, type ExchangeStatus } from '../api/exchangeService';
import { authService } from '../api/authService';
import { ratingService } from '../api/ratingService';
import { formatDate } from '../utils/date';
import { getNetworkErrorMessage } from '../utils/networkError';
import { STORAGE_KEYS, readJsonStorageValue, writeJsonStorageValue } from '../utils/storage';
import {
  RATINGS_UPDATED_EVENT,
  dispatchRatingsUpdated,
  extractRatingsUpdatedDetail,
  type RatingsUpdatedDetail,
} from '../utils/ratingsEvents';
import { useRatingsCache } from '../hooks/useRatingsCache';
import { formatRatingLine } from '../utils/ratingsFormat';
import { analyzeAnnouncementQuery } from '../utils/searchNlp';

const statusLabels: Record<ExchangeStatus, string> = {
  pending: 'Очікує',
  accepted: 'Погоджено',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};

const statusClasses: Record<ExchangeStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  completed: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

const typeLabels: Record<string, string> = {
  offering: 'Пропоную',
  'looking-for': 'Шукаю',
};

const categoryLabels: Record<string, string> = {
  indoor: 'Кімнатна',
  succulent: 'Сукулент',
  other: 'Інше',
};

const sizeLabels: Record<string, string> = {
  small: 'Малий',
  medium: 'Середній',
  large: 'Великий',
};

const conditionLabels: Record<string, string> = {
  healthy: 'Здорова',
  'needs-care': 'Потребує догляду',
};

const careLabels: Record<string, string> = {
  easy: 'Легкий догляд',
  medium: 'Середній догляд',
  hard: 'Складний догляд',
};

type ExchangeTab = 'all' | 'active' | 'completed' | 'cancelled';
type SortOption = 'newest' | 'oldest';

type ExchangeRole = 'initiator' | 'receiver' | 'participant' | 'unknown';

const resolveLabel = (value: string | undefined, map: Record<string, string>) => {
  if (!value) return undefined;
  return map[value] ?? value;
};

const buildAnnouncementSearchText = (announcement: ExchangeAnnouncement) => {
  return [
    announcement.plantName,
    announcement.description,
    announcement.city,
    announcement.district,
    announcement.location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const matchesExchangeStatus = (
  status: ExchangeStatus,
  nlpStatus: 'active' | 'pending' | 'rejected' | 'inactive' | null
) => {
  if (!nlpStatus) return true;
  if (nlpStatus === 'pending') return status === 'pending';
  if (nlpStatus === 'active') return status === 'pending' || status === 'accepted';
  if (nlpStatus === 'inactive') return status === 'completed' || status === 'cancelled';
  if (nlpStatus === 'rejected') return status === 'cancelled';
  return true;
};

const exchangeTabFilters: ExchangeTab[] = ['all', 'active', 'completed', 'cancelled'];
const categoryFilters: Array<'all' | 'indoor' | 'succulent' | 'other'> = ['all', 'indoor', 'succulent', 'other'];
const sizeFilters: Array<'all' | 'small' | 'medium' | 'large'> = ['all', 'small', 'medium', 'large'];
const conditionFilters: Array<'all' | 'healthy' | 'needs-care'> = ['all', 'healthy', 'needs-care'];
const careLevelFilters: Array<'all' | 'easy' | 'medium' | 'hard'> = ['all', 'easy', 'medium', 'hard'];

const readExchangesFilters = () => {
  return readJsonStorageValue<{
    activeTab?: ExchangeTab;
    searchQuery?: string;
    selectedCategory?: 'all' | 'indoor' | 'succulent' | 'other';
    selectedSize?: 'all' | 'small' | 'medium' | 'large';
    selectedCondition?: 'all' | 'healthy' | 'needs-care';
    selectedCareLevel?: 'all' | 'easy' | 'medium' | 'hard';
    sortBy?: SortOption;
  }>(STORAGE_KEYS.exchangesFilters);
};

const pickValue = <T,>(...values: Array<T | null | undefined>): T | undefined =>
  values.find((value) => value !== undefined && value !== null) as T | undefined;

const mergeAnnouncement = (
  primary?: ExchangeAnnouncement,
  fallback?: ExchangeAnnouncement,
  cached?: ExchangeAnnouncement
): ExchangeAnnouncement | undefined => {
  const source = primary ?? fallback ?? cached;
  if (!source) return undefined;
  return {
    id: String(pickValue(primary?.id, fallback?.id, cached?.id, source.id)),
    userId: pickValue(primary?.userId, fallback?.userId, cached?.userId),
    plantName: pickValue(primary?.plantName, fallback?.plantName, cached?.plantName),
    previewPhoto: pickValue(primary?.previewPhoto, fallback?.previewPhoto, cached?.previewPhoto),
    image: pickValue(primary?.image, fallback?.image, cached?.image),
    images: pickValue(primary?.images, fallback?.images, cached?.images),
    type: pickValue(primary?.type, fallback?.type, cached?.type),
    location: pickValue(primary?.location, fallback?.location, cached?.location),
    city: pickValue(primary?.city, fallback?.city, cached?.city),
    district: pickValue(primary?.district, fallback?.district, cached?.district),
    category: pickValue(primary?.category, fallback?.category, cached?.category),
    size: pickValue(primary?.size, fallback?.size, cached?.size),
    condition: pickValue(primary?.condition, fallback?.condition, cached?.condition),
    careLevel: pickValue(primary?.careLevel, fallback?.careLevel, cached?.careLevel),
    description: pickValue(primary?.description, fallback?.description, cached?.description),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const resolveExchangeFromRealtimePayload = (payload: unknown): ExchangeItem | null => {
  if (!isRecord(payload)) return null;
  const candidate = payload.exchange ?? payload.data ?? payload.result ?? payload;
  if (!isRecord(candidate)) return null;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  return candidate as ExchangeItem;
};

const normalizeRatingTarget = (
  value: unknown
): ExchangeItem['ratingTarget'] => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : undefined,
    avatar: typeof value.avatar === 'string' ? value.avatar : null,
    rating:
      typeof value.rating === 'number'
        ? value.rating
        : typeof value.averageRating === 'number'
          ? value.averageRating
          : null,
  };
};

const resolveRatingTargetForExchange = (
  exchange: ExchangeItem,
  fallback?: ExchangeItem
): ExchangeItem['ratingTarget'] => {
  const explicitTarget = normalizeRatingTarget(exchange.ratingTarget);
  if (explicitTarget) return explicitTarget;

  const source =
    exchange.interlocutor ??
    fallback?.interlocutor ??
    exchange.receiver ??
    fallback?.receiver ??
    exchange.initiator ??
    fallback?.initiator ??
    null;
  return normalizeRatingTarget(source);
};

const sortExchangesByCreatedAtDesc = (items: ExchangeItem[]) =>
  [...items].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:3000';

export default function ExchangesPage() {
  const [history, setHistory] = useState<ExchangeHistory>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ExchangeTab>(() => {
    const saved = readExchangesFilters()?.activeTab;
    return saved && exchangeTabFilters.includes(saved) ? saved : 'all';
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(authService.getUserId());
  const [searchQuery, setSearchQuery] = useState(() => readExchangesFilters()?.searchQuery ?? '');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'indoor' | 'succulent' | 'other'>(() => {
    const saved = readExchangesFilters()?.selectedCategory;
    return saved && categoryFilters.includes(saved) ? saved : 'all';
  });
  const [selectedSize, setSelectedSize] = useState<'all' | 'small' | 'medium' | 'large'>(() => {
    const saved = readExchangesFilters()?.selectedSize;
    return saved && sizeFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCondition, setSelectedCondition] = useState<'all' | 'healthy' | 'needs-care'>(() => {
    const saved = readExchangesFilters()?.selectedCondition;
    return saved && conditionFilters.includes(saved) ? saved : 'all';
  });
  const [selectedCareLevel, setSelectedCareLevel] = useState<'all' | 'easy' | 'medium' | 'hard'>(() => {
    const saved = readExchangesFilters()?.selectedCareLevel;
    return saved && careLevelFilters.includes(saved) ? saved : 'all';
  });
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = readExchangesFilters()?.sortBy;
    return saved && ['newest', 'oldest'].includes(saved) ? saved : 'newest';
  });
  const [cancelTarget, setCancelTarget] = useState<ExchangeItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [ratingTargetExchange, setRatingTargetExchange] = useState<ExchangeItem | null>(null);
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const exchangeCacheRef = useRef<Map<string, ExchangeItem>>(new Map());
  const historyRef = useRef<ExchangeHistory>({});
  const ratingTargetExchangeRef = useRef<ExchangeItem | null>(null);
  const processedRatingPromptRef = useRef<Set<string>>(new Set());

  const nlp = useMemo(() => analyzeAnnouncementQuery(searchQuery), [searchQuery]);
  const effectiveCategory = selectedCategory !== 'all' ? selectedCategory : nlp.category ?? 'all';
  const effectiveSize = selectedSize !== 'all' ? selectedSize : nlp.size ?? 'all';
  const effectiveCondition = selectedCondition !== 'all' ? selectedCondition : nlp.condition ?? 'all';
  const effectiveCareLevel = selectedCareLevel !== 'all' ? selectedCareLevel : nlp.careLevel ?? 'all';
  const effectiveCity = nlp.city;
  const effectiveDistrict = nlp.district;
  const effectiveStatus = nlp.status;
  const effectiveKeywords = nlp.keywords;

  const ratingUserIds = useMemo(() => {
    const ids: Array<string | null | undefined> = [];
    [history.active, history.completed, history.cancelled].forEach((items) => {
      (items ?? []).forEach((item) => {
        ids.push(item.interlocutor?.id, item.initiator?.id, item.receiver?.id);
      });
    });
    return ids;
  }, [history]);

  const { ratingsByUserId } = useRatingsCache(ratingUserIds);

  const refreshHistory = async (options?: { silent?: boolean; source?: 'mine' | 'history' | 'both' }) => {
    const isSilent = options?.silent ?? false;
    const source = options?.source ?? 'mine';
    try {
      if (!isSilent) {
        setIsLoading(true);
      }
      setLoadError(null);
      let data: ExchangeHistory | null = null;

      const shouldFetchHistory = source === 'history' || source === 'both';
      const shouldFetchMine = source === 'mine' || source === 'both';

      const [historyResult, mineResult] = await Promise.allSettled([
        shouldFetchHistory ? exchangeService.history() : Promise.resolve(null),
        shouldFetchMine ? exchangeService.listMine() : Promise.resolve([]),
      ]);

      const list =
        mineResult.status === 'fulfilled' && Array.isArray(mineResult.value)
          ? mineResult.value
          : [];
      const uniqueList = Array.from(new Map(list.map((item) => [item.id, item])).values());
      const listMap = new Map(uniqueList.map((item) => [item.id, item]));

      const mergeFromMine = (item: ExchangeItem) => {
        const fallback = listMap.get(item.id);
        if (!fallback) return item;
        return {
          ...fallback,
          ...item,
          announcement: mergeAnnouncement(item.announcement, fallback.announcement),
          interlocutor: item.interlocutor ?? fallback.interlocutor,
          initiator: item.initiator ?? fallback.initiator,
          receiver: item.receiver ?? fallback.receiver,
          ratingTarget: item.ratingTarget ?? fallback.ratingTarget,
        };
      };

      if (historyResult.status === 'fulfilled' && historyResult.value) {
        const historyResponse = historyResult.value as ExchangeHistory;
        const active = (historyResponse.active ?? []).map(mergeFromMine);
        const completed = (historyResponse.completed ?? []).map(mergeFromMine);
        const cancelled = (historyResponse.cancelled ?? []).map(mergeFromMine);
        const totalCount = active.length + completed.length + cancelled.length;
        if (totalCount > 0) {
          data = { active, completed, cancelled };
        }
      }

      if (!data) {
        data = {
          active: uniqueList.filter((item) => item.status === 'pending' || item.status === 'accepted'),
          completed: uniqueList.filter((item) => item.status === 'completed'),
          cancelled: uniqueList.filter((item) => item.status === 'cancelled'),
        };
      }
      setHistory(data);
      if (!ratingTargetExchange) {
        const pendingRating = data.completed?.find(
          (item) => item.status === 'completed' && item.ratingRequired
        );
        if (pendingRating) {
          setRatingTargetExchange(pendingRating);
          setRatingScore(null);
          setRatingComment('');
          setRatingError(null);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setLoadError(message);
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      if (!isMounted) return;
      await refreshHistory();
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    writeJsonStorageValue(STORAGE_KEYS.exchangesFilters, {
      activeTab,
      searchQuery,
      selectedCategory,
      selectedSize,
      selectedCondition,
      selectedCareLevel,
      sortBy,
    });
  }, [
    activeTab,
    searchQuery,
    selectedCategory,
    selectedSize,
    selectedCondition,
    selectedCareLevel,
    sortBy,
  ]);

  useEffect(() => {
    const cache = exchangeCacheRef.current;
    const items = [
      ...(history.active ?? []),
      ...(history.completed ?? []),
      ...(history.cancelled ?? []),
    ];
    items.forEach((item) => {
      if (item.announcement || item.interlocutor) {
        cache.set(item.id, item);
      }
    });
  }, [history]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    ratingTargetExchangeRef.current = ratingTargetExchange;
  }, [ratingTargetExchange]);

  const applySummaryToParty = (
    party: ExchangeItem['interlocutor'] | ExchangeItem['initiator'] | ExchangeItem['receiver'] | null | undefined,
    detail: RatingsUpdatedDetail
  ) => {
    if (!party || party.id !== detail.userId) return party ?? null;
    return {
      ...party,
      averageRating:
        typeof detail.summary.averageRating === 'number'
          ? detail.summary.averageRating
          : party.averageRating,
      ratingsCount:
        typeof detail.summary.ratingsCount === 'number'
          ? detail.summary.ratingsCount
          : party.ratingsCount,
      completedExchangesCount:
        typeof detail.summary.completedExchangesCount === 'number'
          ? detail.summary.completedExchangesCount
          : (party as { completedExchangesCount?: number | null }).completedExchangesCount,
    };
  };

  const applySummaryToExchange = (exchange: ExchangeItem, detail: RatingsUpdatedDetail) => ({
    ...exchange,
    interlocutor: applySummaryToParty(exchange.interlocutor, detail) ?? exchange.interlocutor,
    initiator: applySummaryToParty(exchange.initiator, detail) ?? exchange.initiator,
    receiver: applySummaryToParty(exchange.receiver, detail) ?? exchange.receiver,
    ratingTarget:
      exchange.ratingTarget && exchange.ratingTarget.id === detail.userId
        ? {
            ...exchange.ratingTarget,
            rating:
              typeof detail.summary.averageRating === 'number'
                ? detail.summary.averageRating
                : exchange.ratingTarget.rating,
          }
        : exchange.ratingTarget,
  });

  const resetRatingDraft = () => {
    setRatingScore(null);
    setRatingComment('');
    setRatingError(null);
  };

  const findExchangeById = (exchangeId: string) => {
    const allItems = [
      ...(historyRef.current.active ?? []),
      ...(historyRef.current.completed ?? []),
      ...(historyRef.current.cancelled ?? []),
    ];
    return allItems.find((item) => item.id === exchangeId) ?? null;
  };

  const closeRatingPromptForExchange = (exchangeId: string) => {
    setRatingTargetExchange((prev) => (prev?.id === exchangeId ? null : prev));
    if (ratingTargetExchangeRef.current?.id === exchangeId) {
      resetRatingDraft();
    }
  };

  const openRatingPromptForExchange = (
    exchangeId: string,
    ratingTargetPayload?: unknown,
    sourceExchange?: ExchangeItem
  ) => {
    const existingModal = ratingTargetExchangeRef.current;
    const fromHistory = findExchangeById(exchangeId);
    const cached = exchangeCacheRef.current.get(exchangeId);
    const baseExchange =
      sourceExchange ??
      fromHistory ??
      cached ??
      ({
        id: exchangeId,
        status: 'completed',
      } as ExchangeItem);

    const resolvedTarget =
      normalizeRatingTarget(ratingTargetPayload) ??
      resolveRatingTargetForExchange(baseExchange, fromHistory ?? cached);
    if (!resolvedTarget) return;

    if (existingModal?.id === exchangeId) {
      setRatingTargetExchange((prev) =>
        prev && prev.id === exchangeId
          ? {
              ...prev,
              ...baseExchange,
              status: baseExchange.status ?? prev.status,
              ratingTarget: resolvedTarget,
              ratingRequired: true,
            }
          : prev
      );
      return;
    }

    if (processedRatingPromptRef.current.has(exchangeId)) return;

    processedRatingPromptRef.current.add(exchangeId);
    resetRatingDraft();
    setRatingTargetExchange({
      ...baseExchange,
      status: baseExchange.status ?? 'completed',
      ratingTarget: resolvedTarget,
      ratingRequired: true,
    });
  };

  const syncRatingPromptWithExchange = (exchange: ExchangeItem, existingExchange?: ExchangeItem) => {
    const ratingTarget = resolveRatingTargetForExchange(exchange, existingExchange);
    const transitionedToCompleted =
      exchange.status === 'completed' && existingExchange?.status !== 'completed';
    const shouldOpenRatingPrompt =
      exchange.status === 'completed' &&
      (exchange.ratingRequired === true ||
        (exchange.ratingRequired !== false && transitionedToCompleted));

    if (shouldOpenRatingPrompt && ratingTarget?.id) {
      openRatingPromptForExchange(exchange.id, ratingTarget, {
        ...exchange,
        ratingTarget,
        ratingRequired: true,
      });
      return;
    }

    if (!exchange.ratingRequired) {
      closeRatingPromptForExchange(exchange.id);
    }
  };

  useEffect(() => {
    const handleRatingsUpdated = (event: Event) => {
      const detail = extractRatingsUpdatedDetail(event);
      if (!detail) return;
      setHistory((prev) => ({
        active: (prev.active ?? []).map((item) => applySummaryToExchange(item, detail)),
        completed: (prev.completed ?? []).map((item) => applySummaryToExchange(item, detail)),
        cancelled: (prev.cancelled ?? []).map((item) => applySummaryToExchange(item, detail)),
      }));
    };

    window.addEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    return () => {
      window.removeEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    };
  }, []);

  useEffect(() => {
    const token = authService.getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_BASE_URL, { auth: { token } });
    const handleExchangeUpdated = (payload: unknown) => {
      const updated = resolveExchangeFromRealtimePayload(payload);
      if (!updated) return;
      const existing =
        findExchangeById(updated.id) ??
        exchangeCacheRef.current.get(updated.id) ??
        undefined;
      updateHistoryWith(updated);
      syncRatingPromptWithExchange(updated, existing);
    };

    const handleRatingPrompt = (payload: unknown) => {
      if (!isRecord(payload)) return;

      const payloadExchangeId =
        typeof payload.exchangeId === 'string' && payload.exchangeId.trim()
          ? payload.exchangeId
          : null;
      const payloadExchange = resolveExchangeFromRealtimePayload(payload);
      const exchangeId = payloadExchangeId ?? payloadExchange?.id ?? null;
      if (!exchangeId) return;

      if (payload.shouldPrompt === true) {
        openRatingPromptForExchange(
          exchangeId,
          payload.ratingTarget,
          payloadExchange ?? undefined
        );
        return;
      }

      if (payload.shouldPrompt === false) {
        processedRatingPromptRef.current.add(exchangeId);
        closeRatingPromptForExchange(exchangeId);
      }
    };

    socket.off('exchange:updated', handleExchangeUpdated);
    socket.on('exchange:updated', handleExchangeUpdated);
    socket.off('exchange:view-updated', handleExchangeUpdated);
    socket.on('exchange:view-updated', handleExchangeUpdated);
    socket.off('exchange:rating-prompt', handleRatingPrompt);
    socket.on('exchange:rating-prompt', handleRatingPrompt);

    return () => {
      socket.off('exchange:updated', handleExchangeUpdated);
      socket.off('exchange:view-updated', handleExchangeUpdated);
      socket.off('exchange:rating-prompt', handleRatingPrompt);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const updateUser = async () => {
      const stored = authService.getUserId();
      if (stored) {
        if (isMounted) setCurrentUserId(stored);
        return;
      }
      try {
        const me = await authService.me();
        if (!isMounted) return;
        authService.setUserId(me.id);
        setCurrentUserId(me.id);
      } catch {
        if (isMounted) setCurrentUserId(null);
      }
    };

    updateUser();
    window.addEventListener('auth-token-changed', updateUser);
    window.addEventListener('storage', updateUser);
    return () => {
      isMounted = false;
      window.removeEventListener('auth-token-changed', updateUser);
      window.removeEventListener('storage', updateUser);
    };
  }, []);

  const updateHistoryWith = (updated: ExchangeItem) => {
    setHistory((prev) => {
      const allItems = [
        ...(prev.active ?? []),
        ...(prev.completed ?? []),
        ...(prev.cancelled ?? []),
      ];
      const existing = allItems.find((item) => item.id === updated.id);
      const cached = exchangeCacheRef.current.get(updated.id);
      const merged: ExchangeItem = {
        ...(cached ?? {}),
        ...(existing ?? {}),
        ...updated,
        announcement: mergeAnnouncement(
          updated.announcement,
          existing?.announcement,
          cached?.announcement
        ),
        interlocutor: updated.interlocutor ?? existing?.interlocutor ?? cached?.interlocutor,
        initiator: updated.initiator ?? existing?.initiator ?? cached?.initiator,
        receiver: updated.receiver ?? existing?.receiver ?? cached?.receiver,
        ratingTarget: updated.ratingTarget ?? existing?.ratingTarget ?? cached?.ratingTarget,
      };
      if (merged.announcement || merged.interlocutor) {
        exchangeCacheRef.current.set(merged.id, merged);
      }
      const next: ExchangeHistory = {
        active: (prev.active ?? []).filter((item) => item.id !== updated.id),
        completed: (prev.completed ?? []).filter((item) => item.id !== updated.id),
        cancelled: (prev.cancelled ?? []).filter((item) => item.id !== updated.id),
      };

      const targetStatus = merged.status;
      const targetKey: ExchangeTab =
        targetStatus === 'completed'
          ? 'completed'
          : targetStatus === 'cancelled'
            ? 'cancelled'
            : 'active';

      const targetList = next[targetKey] ?? [];
      next[targetKey] = [merged, ...targetList];

      return next;
    });
  };

  const markExchangeRated = (exchangeId: string) => {
    processedRatingPromptRef.current.add(exchangeId);
    setHistory((prev) => {
      const updateList = (items: ExchangeItem[] | undefined) =>
        (items ?? []).map((item) =>
          item.id === exchangeId ? { ...item, ratingRequired: false } : item
        );
      const next = {
        active: updateList(prev.active),
        completed: updateList(prev.completed),
        cancelled: updateList(prev.cancelled),
      };
      const updatedItem =
        [...(next.active ?? []), ...(next.completed ?? []), ...(next.cancelled ?? [])].find(
          (item) => item.id === exchangeId
        ) ?? null;
      if (updatedItem) {
        exchangeCacheRef.current.set(exchangeId, updatedItem);
      }
      return next;
    });
  };

  const handleStatusChange = async (
    exchangeId: string,
    status: ExchangeStatus,
    existingExchange?: ExchangeItem
  ) => {
    if (status === 'completed') {
      throw new Error('Завершення обміну підтверджується окремою дією.');
    }
    const updated = await exchangeService.updateStatus(exchangeId, status);
    updateHistoryWith(updated);
    syncRatingPromptWithExchange(updated, existingExchange);
    void refreshHistory({ silent: true, source: 'both' });

    if (updated.status === 'completed') {
      const candidateIds = [
        updated.interlocutor?.id,
        updated.initiator?.id,
        updated.receiver?.id,
      ].filter((value): value is string => Boolean(value && value.trim()));
      const uniqueIds = Array.from(new Set(candidateIds));
      await Promise.all(
        uniqueIds.map(async (userId) => {
          try {
            const summary = await ratingService.getSummary(userId);
            dispatchRatingsUpdated({ userId, summary });
          } catch {
            // Ignore summary refresh failures and rely on realtime fallback.
          }
        })
      );
    }
    return updated;
  };

  const handleConfirmCompletion = async (
    exchangeId: string,
    existingExchange?: ExchangeItem
  ) => {
    const updated = await exchangeService.confirmCompletion(exchangeId);
    updateHistoryWith(updated);
    syncRatingPromptWithExchange(updated, existingExchange);
    void refreshHistory({ silent: true, source: 'both' });

    return updated;
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    try {
      setIsCancelling(true);
      setCancelError(null);
      await handleStatusChange(cancelTarget.id, 'cancelled', cancelTarget);
      setCancelTarget(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setCancelError(message);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRatingSubmit = async () => {
    if (!ratingTargetExchange || !ratingScore) return;
    const exchangeId = ratingTargetExchange.id;
    const ratingTargetUserId = ratingTargetExchange.ratingTarget?.id;
    try {
      setRatingSubmitting(true);
      setRatingError(null);
      await ratingService.create({
        exchangeId,
        score: ratingScore,
        comment: ratingComment.trim() || undefined,
      });
      if (ratingTargetUserId) {
        try {
          const summary = await ratingService.getSummary(ratingTargetUserId);
          dispatchRatingsUpdated({ userId: ratingTargetUserId, summary });
        } catch {
          // Ignore summary refresh failures and rely on realtime fallback.
        }
      }
      markExchangeRated(exchangeId);
      setRatingTargetExchange(null);
      setRatingScore(null);
      setRatingComment('');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setRatingError(message);
    } finally {
      setRatingSubmitting(false);
    }
  };

  const tabs = useMemo(
    () => [
      { key: 'active' as const, label: 'Активні', items: sortExchangesByCreatedAtDesc(history.active ?? []) },
      { key: 'completed' as const, label: 'Завершені', items: sortExchangesByCreatedAtDesc(history.completed ?? []) },
      { key: 'cancelled' as const, label: 'Скасовані', items: sortExchangesByCreatedAtDesc(history.cancelled ?? []) },
    ],
    [history]
  );

  const currentItems = useMemo(() => {
    if (activeTab === 'all') {
      return sortExchangesByCreatedAtDesc([
        ...(history.active ?? []),
        ...(history.completed ?? []),
        ...(history.cancelled ?? []),
      ]);
    }
    return tabs.find((tab) => tab.key === activeTab)?.items ?? [];
  }, [tabs, activeTab, history]);

  const applyFilters = (items: ExchangeItem[]) =>
    items.filter((item) => {
      const announcement = item.announcement;
      if (!announcement) return false;

      if (effectiveCategory !== 'all' && announcement.category !== effectiveCategory) return false;
      if (effectiveSize !== 'all' && announcement.size !== effectiveSize) return false;
      if (effectiveCondition !== 'all' && announcement.condition !== effectiveCondition) return false;
      if (effectiveCareLevel !== 'all' && announcement.careLevel !== effectiveCareLevel) return false;
      if (!matchesExchangeStatus(item.status, effectiveStatus)) return false;

      if (effectiveCity) {
        const city = announcement.city?.toLowerCase() ?? '';
        if (!city.includes(effectiveCity.toLowerCase())) return false;
      }

      if (effectiveDistrict) {
        const district = announcement.district?.toLowerCase() ?? '';
        if (!district.includes(effectiveDistrict.toLowerCase())) return false;
      }

      if (effectiveKeywords.length > 0) {
        const text = buildAnnouncementSearchText(announcement);
        if (!effectiveKeywords.some((keyword) => text.includes(keyword))) return false;
      }

      return true;
    });

  const filteredItems = useMemo(() => {
    const result = applyFilters(currentItems);
    if (sortBy === 'oldest') {
      return [...result].sort(
        (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      );
    }
    return [...result].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
  }, [
    currentItems,
    effectiveCategory,
    effectiveSize,
    effectiveCondition,
    effectiveCareLevel,
    effectiveCity,
    effectiveDistrict,
    effectiveStatus,
    effectiveKeywords,
    sortBy,
  ]);

  const activeFiltersCount = [
    searchQuery !== '',
    selectedCategory !== 'all',
    selectedSize !== 'all',
    selectedCondition !== 'all',
    selectedCareLevel !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSize('all');
    setSelectedCondition('all');
    setSelectedCareLevel('all');
    setSortBy('newest');
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
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
              value={activeTab}
              onChange={(event) => setActiveTab(event.target.value as ExchangeTab)}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Тип: Всі</option>
              <option value="active">Активні</option>
              <option value="completed">Завершені</option>
              <option value="cancelled">Скасовані</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value as 'all' | 'indoor' | 'succulent' | 'other')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Категорія: Всі</option>
              <option value="indoor">Кімнатна</option>
              <option value="succulent">Сукулент</option>
              <option value="other">Інше</option>
            </select>

            <select
              value={selectedSize}
              onChange={(event) => setSelectedSize(event.target.value as 'all' | 'small' | 'medium' | 'large')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Розмір: Всі</option>
              <option value="small">Малий</option>
              <option value="medium">Середній</option>
              <option value="large">Великий</option>
            </select>

            <select
              value={selectedCondition}
              onChange={(event) => setSelectedCondition(event.target.value as 'all' | 'healthy' | 'needs-care')}
              className="h-11 appearance-none rounded-xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-green-500"
            >
              <option value="all">Стан: Всі</option>
              <option value="healthy">Здорова</option>
              <option value="needs-care">Потребує догляду</option>
            </select>

            <select
              value={selectedCareLevel}
              onChange={(event) => setSelectedCareLevel(event.target.value as 'all' | 'easy' | 'medium' | 'hard')}
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

        <h2 className="mb-4 text-xl font-bold text-slate-950">Мої обміни</h2>

        {isLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо обміни...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Немає обмінів у цій категорії.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((exchange) => (
              <ExchangeCard
                key={exchange.id}
                exchange={exchange}
                currentUserId={currentUserId}
                ratingsByUserId={ratingsByUserId}
                onStatusChange={handleStatusChange}
                onConfirmCompletion={handleConfirmCompletion}
                onRequestCancel={() => setCancelTarget(exchange)}
              />
            ))}
          </div>
        )}
      </main>

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Скасувати обмін?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Ви дійсно хочете скасувати обмін "{cancelTarget.announcement?.plantName ?? 'Оголошення'}"?
            </p>

            {cancelError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {cancelError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelError(null);
                }}
                className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
                disabled={isCancelling}
              >
                Назад
              </button>
              <button
                type="button"
                onClick={handleCancelConfirm}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                disabled={isCancelling}
              >
                {isCancelling ? 'Скасовуємо...' : 'Скасувати'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ratingTargetExchange ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Оцінити обмін</h3>
            <p className="mt-2 text-sm text-slate-600">
              Поділіться враженням про взаємодію з користувачем.
            </p>

            <Link
              to={ratingTargetExchange.ratingTarget?.id ? `/users/${ratingTargetExchange.ratingTarget.id}` : '#'}
              onClick={(event) => {
                if (!ratingTargetExchange.ratingTarget?.id) event.preventDefault();
              }}
              className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 transition hover:bg-green-50/60"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-green-100">
                {ratingTargetExchange.ratingTarget?.avatar ? (
                  <img
                    src={ratingTargetExchange.ratingTarget.avatar}
                    alt={ratingTargetExchange.ratingTarget.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-5 w-5 text-green-700" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {ratingTargetExchange.ratingTarget?.name || 'Користувач'}
                </p>
                <p className="text-xs text-slate-500">Оцінити від 1 до 5</p>
              </div>
            </Link>

            <div className="mt-4 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRatingScore(value)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
                    ratingScore === value
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-green-400'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <textarea
              value={ratingComment}
              onChange={(event) => setRatingComment(event.target.value)}
              placeholder="Коментар (необов'язково)"
              className="mt-4 min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-green-500"
            />

            {ratingError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {ratingError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (ratingTargetExchange?.id) {
                    processedRatingPromptRef.current.add(ratingTargetExchange.id);
                  }
                  setRatingTargetExchange(null);
                  resetRatingDraft();
                }}
                className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
                disabled={ratingSubmitting}
              >
                Пізніше
              </button>
              <button
                type="button"
                onClick={handleRatingSubmit}
                className="h-11 flex-1 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700"
                disabled={ratingSubmitting || !ratingScore}
              >
                {ratingSubmitting ? 'Надсилаємо...' : 'Надіслати оцінку'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ExchangeCardProps = {
  exchange: ExchangeItem;
  currentUserId: string | null;
  ratingsByUserId: Record<string, { averageRating?: number; ratingsCount?: number; completedExchangesCount?: number }>;
  onStatusChange: (exchangeId: string, status: ExchangeStatus, existingExchange?: ExchangeItem) => Promise<ExchangeItem>;
  onConfirmCompletion: (exchangeId: string, existingExchange?: ExchangeItem) => Promise<ExchangeItem>;
  onRequestCancel: () => void;
};

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const resolveExchangeRole = (exchange: ExchangeItem, currentUserId: string | null): ExchangeRole => {
  const currentId = normalizeId(currentUserId);
  if (!currentId) return 'unknown';
  const initiatorId = normalizeId(
    exchange.initiator?.id ??
      exchange.initiatorId ??
      exchange.requesterId ??
      exchange.createdBy
  );
  const receiverId = normalizeId(
    exchange.receiver?.id ??
      exchange.receiverId ??
      exchange.ownerId
  );

  if (initiatorId && currentId === initiatorId) return 'initiator';
  if (receiverId && currentId === receiverId) return 'receiver';

  const knownIds = [initiatorId, receiverId].filter(Boolean) as string[];
  if (knownIds.includes(currentId)) return 'participant';

  return 'unknown';
};

function ExchangeCard({ exchange, currentUserId, ratingsByUserId, onStatusChange, onConfirmCompletion, onRequestCancel }: ExchangeCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const interlocutor = exchange.interlocutor;
  const announcement = exchange.announcement;
  const status = exchange.status;
  const cachedSummary = interlocutor?.id ? ratingsByUserId[interlocutor.id] : undefined;
  const resolvedCurrentId = normalizeId(currentUserId ?? authService.getUserId());
  const role = resolveExchangeRole(exchange, resolvedCurrentId);
  const announcementImage =
    announcement?.previewPhoto ||
    announcement?.image ||
    announcement?.images?.[0];
  const location =
    announcement?.location ||
    [announcement?.city, announcement?.district].filter(Boolean).join(', ') ||
    '—';
  const ratingValue =
    typeof cachedSummary?.averageRating === 'number'
      ? cachedSummary.averageRating
      : typeof interlocutor?.averageRating === 'number'
        ? interlocutor.averageRating
        : typeof (interlocutor as { rating?: { averageRating?: number } } | undefined)?.rating?.averageRating === 'number'
          ? (interlocutor as { rating?: { averageRating?: number } }).rating?.averageRating ?? null
          : null;
  const ratingsCount =
    typeof cachedSummary?.ratingsCount === 'number'
      ? cachedSummary.ratingsCount
      : typeof interlocutor?.ratingsCount === 'number'
        ? interlocutor.ratingsCount
        : typeof (interlocutor as { rating?: { ratingsCount?: number } } | undefined)?.rating?.ratingsCount === 'number'
          ? (interlocutor as { rating?: { ratingsCount?: number } }).rating?.ratingsCount ?? null
          : null;
  const completedExchangesCount =
    typeof cachedSummary?.completedExchangesCount === 'number'
      ? cachedSummary.completedExchangesCount
      : typeof interlocutor?.completedExchangesCount === 'number'
        ? interlocutor.completedExchangesCount
        : 0;
  const ratingText = formatRatingLine({
    averageRating: ratingValue ?? undefined,
    ratingsCount: ratingsCount ?? undefined,
    completedExchangesCount,
  });
  const typeLabel = resolveLabel(announcement?.type, typeLabels);
  const categoryLabel = resolveLabel(announcement?.category, categoryLabels);
  const sizeLabel = resolveLabel(announcement?.size, sizeLabels);
  const conditionLabel = resolveLabel(announcement?.condition, conditionLabels);
  const careLabel = resolveLabel(announcement?.careLevel, careLabels);

  const initiatorId = normalizeId(
    exchange.initiatorId ??
      exchange.requesterId ??
      exchange.createdBy ??
      exchange.initiator?.id
  );
  const receiverId = normalizeId(
    exchange.receiverId ??
      exchange.ownerId ??
      exchange.receiver?.id ??
      announcement?.userId
  );
  const currentId = resolvedCurrentId;
  const isReceiver = Boolean(currentId && receiverId && currentId === receiverId) || role === 'receiver';
  const isInitiator =
    Boolean(currentId && initiatorId && currentId === initiatorId) ||
    Boolean(currentId && receiverId && currentId !== receiverId) ||
    role === 'initiator';
  const isParticipant = isInitiator || isReceiver;
  const canAccept = status === 'pending' && isReceiver;
  const canCancel = (status === 'pending' || status === 'accepted') && isParticipant;
  const canSeeCompletionButton = status === 'accepted' && isParticipant;
  const canConfirmCompletion = canSeeCompletionButton && Boolean(exchange.canConfirmCompletion);
  const [localConfirmedCompletion, setLocalConfirmedCompletion] = useState<boolean>(Boolean(exchange.completionConfirmedByCurrentUser));
  useEffect(() => {
    setLocalConfirmedCompletion(Boolean(exchange.completionConfirmedByCurrentUser));
  }, [exchange.id, exchange.completionConfirmedByCurrentUser]);
  const hasConfirmedCompletion = localConfirmedCompletion;
  const awaitingOtherParticipant = canSeeCompletionButton && hasConfirmedCompletion;

  const handleAction = async (nextStatus: ExchangeStatus) => {
    try {
      setIsUpdating(true);
      setActionError(null);
      setActionSuccess(null);
      await onStatusChange(exchange.id, nextStatus, exchange);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setActionError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmCompletionAction = async () => {
    if (!canConfirmCompletion && !hasConfirmedCompletion) {
      setActionSuccess(null);
      setActionError('Поки ви не можете підтвердити завершення. Спочатку це має зробити інша сторона.');
      return;
    }
    if (hasConfirmedCompletion) return;
    // Optimistic update: mark as confirmed locally so UI updates immediately
    setLocalConfirmedCompletion(true);
    try {
      setIsUpdating(true);
      setActionError(null);
      setActionSuccess(null);
      const updated = await onConfirmCompletion(exchange.id, exchange);
      if (updated.status === 'completed') {
        // Don't show a separate success message here — rating modal appears instead.
        setActionSuccess(null);
      } else {
        setActionSuccess('Ви підтвердили завершення. Очікуємо підтвердження іншого учасника.');
      }
    } catch (error) {
      // rollback optimistic change on error
      setLocalConfirmedCompletion(false);
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setActionError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <article className="relative flex w-full min-w-0 flex-col gap-4 rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
      <span className={`hidden rounded-full px-4 py-2 text-sm font-semibold sm:absolute sm:right-5 sm:top-5 sm:inline-flex ${statusClasses[status]}`}>
        {statusLabels[status]}
      </span>

      <div className="relative h-[220px] w-full shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:w-[220px]">
        {announcementImage ? (
          <img src={announcementImage} alt={announcement?.plantName} className="h-full w-full object-cover" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-start justify-between gap-3 sm:pr-32">
          <h3 className="min-w-0 break-words text-[17px] font-bold leading-tight text-slate-950">
            {announcement?.plantName ?? 'Оголошення без назви'}
          </h3>
          {typeLabel ? (
            <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {typeLabel}
            </span>
          ) : null}
        </div>

        <span className={`mt-2 inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold sm:hidden ${statusClasses[status]}`}>
          {statusLabels[status]}
        </span>
        <div className="mt-3 flex flex-wrap gap-2">
          {categoryLabel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {categoryLabel}
            </span>
          ) : null}
          {sizeLabel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {sizeLabel}
            </span>
          ) : null}
          {conditionLabel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {conditionLabel}
            </span>
          ) : null}
          {careLabel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {careLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-2 text-sm text-slate-500">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="min-w-0 break-words">{location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(exchange.createdAt)}</span>
          </div>
        </div>

        <p className="mt-3 break-words text-sm text-slate-600">
          {announcement?.description || 'Без опису'}
        </p>

        <div className="mt-4 grid items-center gap-3 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Link
            to={interlocutor?.id ? `/users/${interlocutor.id}` : '#'}
            onClick={(event) => {
              if (!interlocutor?.id) event.preventDefault();
            }}
            className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
          >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-green-100">
              {interlocutor?.avatar ? (
                <img src={interlocutor.avatar} alt={interlocutor.name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-4 w-4 text-green-700" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {interlocutor?.name || 'Користувач'}
              </p>
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span>{ratingText}</span>
              </div>
            </div>
          </div>
          </Link>

          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canAccept ? (
              <button
                type="button"
                onClick={() => handleAction('accepted')}
                disabled={isUpdating}
                className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition sm:w-auto sm:min-w-[150px] ${
                  isUpdating
                    ? 'cursor-not-allowed bg-emerald-100 text-emerald-300'
                    : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                }`}
              >
                Погодити обмін
              </button>
            ) : null}

                        {canSeeCompletionButton ? (
                          <button
                            type="button"
                            onClick={handleConfirmCompletionAction}
                            disabled={isUpdating || awaitingOtherParticipant}
                            className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition sm:w-auto sm:min-w-[240px] ${
                              isUpdating || awaitingOtherParticipant
                                ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                                : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                            }`}
                          >
                            {awaitingOtherParticipant ? 'Очікує підтвердження іншого учасника' : 'Підтвердити завершення'}
                          </button>
                        ) : null}

            {canCancel ? (
              <button
                type="button"
                onClick={onRequestCancel}
                disabled={isUpdating}
                className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition sm:w-auto sm:min-w-[120px] ${
                  isUpdating
                    ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Скасувати
              </button>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <p className="mt-3 text-xs font-medium text-red-600">{actionError}</p>
        ) : null}
        {actionSuccess ? (
          <p className="mt-2 text-xs font-medium text-emerald-600">{actionSuccess}</p>
        ) : null}
      </div>
    </article>
  );
}
