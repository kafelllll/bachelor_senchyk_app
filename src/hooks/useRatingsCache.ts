import { useEffect, useState } from 'react';

import { ratingService, type RatingSummary } from '../api/ratingService';
import { RATINGS_UPDATED_EVENT, extractRatingsUpdatedDetail } from '../utils/ratingsEvents';

type RatingsByUserId = Record<string, RatingSummary>;

type RatingsCacheSnapshot = {
  ratingsByUserId: RatingsByUserId;
  isLoading: boolean;
};

const ratingsCache = new Map<string, RatingSummary>();
const inFlight = new Set<string>();

const normalizeUserIds = (userIds: Array<string | null | undefined>): string[] => {
  const set = new Set<string>();
  userIds.forEach((id) => {
    if (typeof id !== 'string') return;
    const trimmed = id.trim();
    if (!trimmed) return;
    set.add(trimmed);
  });
  return Array.from(set).sort();
};

const buildSnapshot = (userIds: string[]): RatingsByUserId => {
  const next: RatingsByUserId = {};
  userIds.forEach((id) => {
    const summary = ratingsCache.get(id);
    if (summary) {
      next[id] = summary;
    }
  });
  return next;
};

export const useRatingsCache = (
  userIds: Array<string | null | undefined>
): RatingsCacheSnapshot => {
  const normalizedIds = normalizeUserIds(userIds);
  const idsKey = normalizedIds.join('|');
  const [ratingsByUserId, setRatingsByUserId] = useState<RatingsByUserId>(() =>
    buildSnapshot(normalizedIds)
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setRatingsByUserId((prev) => ({ ...prev, ...buildSnapshot(normalizedIds) }));
  }, [idsKey]);

  useEffect(() => {
    if (normalizedIds.length === 0) return undefined;

    let isMounted = true;

    const fetchMissing = async () => {
      const missing = normalizedIds.filter(
        (id) => !ratingsCache.has(id) && !inFlight.has(id)
      );
      if (missing.length === 0) return;

      setIsLoading(true);

      await Promise.all(
        missing.map(async (userId) => {
          inFlight.add(userId);
          try {
            const summary = await ratingService.getSummary(userId);
            ratingsCache.set(userId, summary);
            if (isMounted) {
              setRatingsByUserId((prev) => ({ ...prev, [userId]: summary }));
            }
          } catch {
            // Ignore fetch errors to keep UI responsive.
          } finally {
            inFlight.delete(userId);
          }
        })
      );

      if (isMounted) {
        setIsLoading(false);
      }
    };

    fetchMissing();

    return () => {
      isMounted = false;
    };
  }, [idsKey]);

  useEffect(() => {
    const handleRatingsUpdated = (event: Event) => {
      const detail = extractRatingsUpdatedDetail(event);
      if (!detail) return;
      ratingsCache.set(detail.userId, detail.summary);
      setRatingsByUserId((prev) => ({ ...prev, [detail.userId]: detail.summary }));
    };

    window.addEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    return () => {
      window.removeEventListener(RATINGS_UPDATED_EVENT, handleRatingsUpdated);
    };
  }, []);

  return { ratingsByUserId, isLoading };
};
