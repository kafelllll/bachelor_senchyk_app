import type {
  WateringFreq,
  LightReqs,
  Humidity,
  Toxicity,
  GrowthRate,
  Category,
  Size,
  Condition,
  CareLevel,
} from '../api/announcementService';

export type ListingType = 'offering' | 'looking-for';
export type ListingStatus = 'active' | 'inactive' | 'in-progress' | 'completed';
export type MatchLevel = 'high' | 'medium' | 'low';
export type WateringFreqType = WateringFreq | undefined;
export type LightReqsType = LightReqs | undefined;
export type HumidityType = Humidity | undefined;
export type ToxicityType = Toxicity | undefined;
export type GrowthRateType = GrowthRate | undefined;

export type BaseListing = {
  id: string;
  userId?: string;
  userAvatar?: string;
  plantName: string;
  commonName?: string;
  scientificName?: string;
  genus?: string;
  family?: string;
  type: ListingType;
  description: string;
  image: string;
  images: string[];
  city?: string;
  district?: string;
  location: string;
  postedDate: string;
  status: ListingStatus;
  category: Category;
  size: Size;
  condition: Condition;
  careLevel: CareLevel;
  additionalTags?: string[];
  pestFree?: boolean;
  readyToExchange?: boolean;
  wateringFreq: WateringFreqType;
  lightReqs: LightReqsType;
  humidity?: HumidityType;
  toxicity?: ToxicityType;
  growthRate?: GrowthRateType;
  hasOffspring?: boolean;
  createdAt?: number;
  updatedAt?: number;
  expiresAt?: number;
  userName: string;
  userRating: number;
  ratingsCount?: number;
  completedExchanges: number;
  matchScore?: number;
  matchLevel?: MatchLevel;
  reputationScore?: number | null;
  reputationContribution?: number | null;
};

export type Recommendation = BaseListing & {
  matchScore: number;
  matchLevel: MatchLevel;
};

const fallbackId = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `listing-${Date.now()}-${counter}`;
  };
})();

export const pickString = (...values: Array<unknown>): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim() !== '');

const pickNumber = (...values: Array<unknown>): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const formatPostedDate = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('uk-UA');
    }
  }
  return 'Нещодавно';
};

export const resolveListingType = (value: unknown): ListingType => {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'offer' || normalized === 'offering') return 'offering';
  if (
    normalized === 'looking-for' ||
    normalized === 'looking for' ||
    normalized === 'search' ||
    normalized === 'looking' ||
    normalized === 'request'
  ) {
    return 'looking-for';
  }
  return 'offering';
};

export const resolveCategory = (value: unknown): Category => {
  if (value === 'indoor' || value === 'succulent' || value === 'other') {
    return value;
  }
  return 'other';
};

export const resolveSize = (value: unknown): Size => {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return 'medium';
};

export const resolveCondition = (value: unknown): Condition => {
  if (value === 'healthy' || value === 'needs-care') {
    return value;
  }
  return 'healthy';
};

export const resolveCareLevel = (value: unknown): CareLevel => {
  if (value === 'easy' || value === 'medium' || value === 'hard') {
    return value;
  }
  return 'easy';
};

export const resolveStatus = (value: unknown): ListingStatus => {
  if (value === 'inactive' || value === 'archived') return 'inactive';
  if (value === 'active' || value === 'in-progress' || value === 'completed') {
    return value;
  }
  return 'active';
};

export const resolveImages = (record: Record<string, unknown>): string[] => {
  const images =
    (record.images as string[] | undefined) ??
    (record.photos as string[] | undefined) ??
    (record.photoUrls as string[] | undefined) ??
    [];
  const firstImage = pickString(
    record.coverPhoto,
    record.cover_photo,
    record.photoUrl,
    record.photo,
    record.imageUrl,
    record.image,
    record.image_url,
    record.plantImage,
    record.plantImageUrl,
    record.referenceImageUrl,
    record.primaryImage,
    record.coverImage
  );
  return [firstImage, ...images]
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, self) => self.indexOf(value) === index);
};

const extractAnnouncementItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as {
      announcements?: unknown;
      matches?: unknown;
      data?: unknown;
      result?: unknown;
      items?: unknown;
    };
    if (Array.isArray(record.announcements)) return record.announcements;
    if (Array.isArray(record.matches)) return record.matches;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.items)) return record.items;
    if (record.data && typeof record.data === 'object') {
      const nested = record.data as { announcements?: unknown; data?: unknown; matches?: unknown };
      if (Array.isArray(nested.announcements)) return nested.announcements;
      if (Array.isArray(nested.matches)) return nested.matches;
      if (Array.isArray(nested.data)) return nested.data;
    }
    if (record.announcements && typeof record.announcements === 'object') {
      const nested = record.announcements as { data?: unknown; items?: unknown };
      if (Array.isArray(nested.data)) return nested.data;
      if (Array.isArray(nested.items)) return nested.items;
    }
    if (record.result && typeof record.result === 'object') {
      const nested = record.result as { announcements?: unknown; data?: unknown; matches?: unknown };
      if (Array.isArray(nested.announcements)) return nested.announcements;
      if (Array.isArray(nested.matches)) return nested.matches;
      if (Array.isArray(nested.data)) return nested.data;
    }
  }
  return [];
};

export const resolveBaseListing = (record: Record<string, unknown>): BaseListing => {
  const creator = record.creator as Record<string, unknown> | undefined;
  const owner = record.owner as Record<string, unknown> | undefined;
  const candidate = record.candidate as Record<string, unknown> | undefined;
  const user =
    (record.user as Record<string, unknown> | undefined) ??
    (candidate?.user as Record<string, unknown> | undefined);
  const images = resolveImages(record);
  const image = images[0] ?? '';
  const city = (record.city as string) ?? '';
  const district = (record.district as string) ?? '';
  const location = [city, district].filter(Boolean).join(', ') || '—';
  const createdAtValue = record.createdAt ?? record.created_at;
  const updatedAtValue = record.updatedAt ?? record.updated_at;
  const expiresAtValue = record.expiresAt ?? record.expires_at;

  const matchScore =
    toFiniteNumber(record.matchScore) ??
    toFiniteNumber(record.score) ??
    undefined;
  const matchLevel =
    (record.matchLevel as MatchLevel | undefined) ??
    (record.match_level as MatchLevel | undefined) ??
    undefined;
  const statusValue = pickString(
    record.status,
    record.state,
    record.announcementStatus,
    record.announcement_status,
    record.listingStatus,
    record.listing_status,
    (record.announcement as Record<string, unknown> | undefined)?.status,
    (record.listing as Record<string, unknown> | undefined)?.status
  );
  const reputationScore =
    typeof record.reputationScore === 'number'
      ? record.reputationScore
      : typeof record.averageRating === 'number'
        ? record.averageRating
        : typeof record.reputation_score === 'number'
          ? record.reputation_score
          : null;
  const reputationContribution =
    typeof record.reputationContribution === 'number'
      ? record.reputationContribution
      : typeof record.reputation_contribution === 'number'
        ? record.reputation_contribution
        : null;

  return {
    id: String(record.id ?? record._id ?? fallbackId()),
    userId: pickString(
      record.userId,
      record.user_id,
      record.createdBy,
      record.created_by,
      record.ownerId,
      record.owner_id,
      user?.id,
      user?._id
    ),
    userAvatar: pickString(
      record.userAvatar,
      record.user_avatar,
      record.avatar,
      record.avatarUrl,
      record.avatar_url,
      user?.avatar,
      user?.avatarUrl,
      creator?.avatar,
      owner?.avatar,
      candidate?.avatar
    ),
    plantName: String(record.plantName ?? record.plant_name ?? 'Невідомо'),
    commonName: (record.commonName as string) ?? (record.common_name as string),
    scientificName: (record.scientificName as string) ?? (record.scientific_name as string),
    genus: record.genus as string | undefined,
    family: record.family as string | undefined,
    type: resolveListingType(record.offerType ?? record.offer_type ?? record.type ?? record.listingType),
    description: String(record.description ?? ''),
    image,
    images,
    city,
    district,
    location,
    postedDate: formatPostedDate(createdAtValue),
    status: resolveStatus(statusValue),
    category: resolveCategory(record.category),
    size: resolveSize(record.size),
    condition: resolveCondition(record.condition),
    careLevel: resolveCareLevel(record.careLevel ?? record.care_level),
    additionalTags: Array.isArray(record.additionalTags)
      ? (record.additionalTags as string[])
      : Array.isArray(record.additional_tags)
        ? (record.additional_tags as string[])
        : undefined,
    pestFree: Boolean(record.pestFree ?? record.pest_free),
    readyToExchange: Boolean(record.readyToExchange ?? record.ready_to_exchange),
    wateringFreq: (record.wateringFreq ?? record.watering_freq) as WateringFreqType,
    lightReqs: (record.lightReqs ?? record.light_reqs) as LightReqsType,
    humidity: record.humidity as HumidityType,
    toxicity: record.toxicity as ToxicityType,
    growthRate: (record.growthRate ?? record.growth_rate) as GrowthRateType,
    hasOffspring: Boolean(record.hasOffspring ?? record.has_offspring),
    createdAt:
      typeof createdAtValue === 'string'
        ? new Date(createdAtValue).getTime()
        : typeof createdAtValue === 'number'
          ? createdAtValue
          : undefined,
    updatedAt:
      typeof updatedAtValue === 'string'
        ? new Date(updatedAtValue).getTime()
        : typeof updatedAtValue === 'number'
          ? updatedAtValue
          : undefined,
    expiresAt:
      typeof expiresAtValue === 'string'
        ? new Date(expiresAtValue).getTime()
        : typeof expiresAtValue === 'number'
          ? expiresAtValue
          : undefined,
    userName: String(
      record.userName ??
        record.user_name ??
        record.ownerName ??
        record.owner_name ??
        record.creatorName ??
        record.creator_name ??
        record.authorName ??
        record.author_name ??
        record.name ??
        (record.creator as Record<string, unknown> | undefined)?.name ??
        (record.createdBy as Record<string, unknown> | undefined)?.name ??
        (record.owner as Record<string, unknown> | undefined)?.name ??
        (record.author as Record<string, unknown> | undefined)?.name ??
        (record.profile as Record<string, unknown> | undefined)?.name ??
        user?.name ??
        user?.fullName ??
        user?.full_name ??
        ((user as Record<string, unknown>)?.profile as Record<string, unknown> | undefined)?.name ??
        (user as Record<string, unknown>)?.displayName ??
        (user as Record<string, unknown>)?.username ??
        user?.email ??
        (user as Record<string, unknown>)?.userName ??
        (user as Record<string, unknown>)?.user_name ??
        'Користувач'
    ),
    userRating:
      pickNumber(
        record.userRating,
        record.user_rating,
        record.averageRating,
        record.ratingAverage,
        (record.rating as { averageRating?: unknown } | undefined)?.averageRating,
        (record.user as { rating?: { averageRating?: unknown } } | undefined)?.rating?.averageRating,
        user?.averageRating,
        (user as Record<string, unknown> | undefined)?.ratingAverage,
        (user as { rating?: { averageRating?: unknown } } | undefined)?.rating?.averageRating,
        (user as { ratingSummary?: { averageRating?: unknown } } | undefined)?.ratingSummary?.averageRating,
        (user as { ratingsSummary?: { averageRating?: unknown } } | undefined)?.ratingsSummary?.averageRating
      ) ?? 0,
    ratingsCount:
      pickNumber(
        record.ratingsCount,
        record.ratings_count,
        record.reviewsCount,
        record.reviews_count,
        (record.rating as { ratingsCount?: unknown } | undefined)?.ratingsCount,
        (record.user as { rating?: { ratingsCount?: unknown } } | undefined)?.rating?.ratingsCount,
        user?.ratingsCount,
        (user as Record<string, unknown> | undefined)?.ratingsCount,
        (user as { rating?: { ratingsCount?: unknown } } | undefined)?.rating?.ratingsCount,
        (user as { ratingSummary?: { ratingsCount?: unknown } } | undefined)?.ratingSummary?.ratingsCount,
        (user as { ratingsSummary?: { ratingsCount?: unknown } } | undefined)?.ratingsSummary?.ratingsCount
      ) ?? 0,
    completedExchanges:
      pickNumber(
        record.completedExchanges,
        record.completed_exchanges,
        record.completedExchangesCount,
        record.completed_exchanges_count,
        record.exchangesCompleted,
        (record.stats as { completedExchanges?: unknown } | undefined)?.completedExchanges,
        (record.user as { rating?: { completedExchangesCount?: unknown } } | undefined)?.rating?.completedExchangesCount,
        user?.completedExchanges,
        (user as Record<string, unknown> | undefined)?.completedExchangesCount,
        (user as Record<string, unknown> | undefined)?.completed_exchanges,
        (user as { ratingSummary?: { completedExchangesCount?: unknown } } | undefined)?.ratingSummary
          ?.completedExchangesCount,
        (user as { ratingsSummary?: { completedExchangesCount?: unknown } } | undefined)?.ratingsSummary
          ?.completedExchangesCount
      ) ?? 0,
    matchScore,
    matchLevel,
    reputationScore,
    reputationContribution,
  };
};

export const resolveListings = (payload: unknown): BaseListing[] => {
  const items = extractAnnouncementItems(payload);
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => resolveBaseListing(item as Record<string, unknown>));
};

export const resolveRecommendations = (payload: unknown): Recommendation[] => {
  const items = extractAnnouncementItems(payload);
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      const announcementRecord = (record.announcement as Record<string, unknown> | undefined) ?? undefined;
      const listingRecord = (record.listing as Record<string, unknown> | undefined) ?? undefined;
      const candidateRecord = (record.candidate as Record<string, unknown> | undefined) ?? undefined;
      const baseRecord = announcementRecord ?? listingRecord ?? candidateRecord ?? record;
      const listing = resolveBaseListing({ ...baseRecord, ...record });
      const resolvedMatchId = pickString(
        record.matchedAnnouncementId,
        record.matched_announcement_id,
        record.candidateAnnouncementId,
        record.candidate_announcement_id,
        record.announcementId,
        record.announcement_id,
        announcementRecord?.id,
        announcementRecord?._id,
        listingRecord?.id,
        listingRecord?._id,
        candidateRecord?.id,
        candidateRecord?._id,
        listing.id
      );
      const matchScore =
        toFiniteNumber(record.score) ??
        toFiniteNumber(record.matchScore) ??
        toFiniteNumber(listing.matchScore) ??
        0;
      const matchLevel =
        (record.matchLevel as MatchLevel | undefined) ??
        (listing.matchLevel as MatchLevel | undefined) ??
        'low';
      const reputationScore =
        typeof record.reputationScore === 'number'
          ? record.reputationScore
          : listing.reputationScore ?? null;
      const reputationContribution =
        typeof record.reputationContribution === 'number'
          ? record.reputationContribution
          : listing.reputationContribution ?? null;
      return {
        ...listing,
        id: resolvedMatchId || `${listing.id}-${index}`,
        matchScore,
        matchLevel,
        reputationScore,
        reputationContribution,
      };
    })
    .filter((item) => Number.isFinite(toFiniteNumber(item.matchScore) ?? NaN));
};
