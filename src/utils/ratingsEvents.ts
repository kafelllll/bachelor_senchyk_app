import type { RatingSummary } from '../api/ratingService';

export const RATINGS_UPDATED_EVENT = 'ratings-updated';

export type RatingsUpdatedDetail = {
  userId: string;
  summary: RatingSummary;
};

export const dispatchRatingsUpdated = (detail: RatingsUpdatedDetail) => {
  window.dispatchEvent(
    new CustomEvent<RatingsUpdatedDetail>(RATINGS_UPDATED_EVENT, { detail })
  );
};

export const extractRatingsUpdatedDetail = (event: Event): RatingsUpdatedDetail | null => {
  const custom = event as CustomEvent<RatingsUpdatedDetail>;
  const detail = custom.detail;
  if (!detail) return null;
  if (typeof detail.userId !== 'string' || detail.userId.trim() === '') return null;
  if (!detail.summary) return null;
  return detail;
};
