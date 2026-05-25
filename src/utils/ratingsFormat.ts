export type RatingLineInput = {
  averageRating?: number | null;
  ratingsCount?: number | null;
  completedExchangesCount?: number | null;
};

export const formatRatingLine = (input: RatingLineInput): string => {
  const ratingsCount = typeof input.ratingsCount === 'number' ? input.ratingsCount : 0;
  const completedExchangesCount =
    typeof input.completedExchangesCount === 'number' ? input.completedExchangesCount : 0;
  const averageRating = typeof input.averageRating === 'number' ? input.averageRating : null;

  if (ratingsCount > 0 && averageRating && averageRating > 0) {
    return `${averageRating.toFixed(1)} · ${ratingsCount} оцінок · ${completedExchangesCount} обмінів`;
  }

  return `0 оцінок · ${completedExchangesCount} обмінів`;
};
