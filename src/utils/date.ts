export const formatDate = (value?: string | number | null, fallback = '—'): string => {
  if (value === undefined || value === null || value === '') return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString('uk-UA');
};