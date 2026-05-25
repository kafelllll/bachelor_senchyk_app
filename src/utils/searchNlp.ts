export type AnnouncementQueryNlp = {
  normalizedQuery: string | null;
  offerType: 'offer' | 'looking-for' | null;
  category: 'indoor' | 'succulent' | 'other' | null;
  size: 'small' | 'medium' | 'large' | null;
  condition: 'healthy' | 'needs-care' | null;
  careLevel: 'easy' | 'medium' | 'hard' | null;
  status: 'active' | 'pending' | 'rejected' | 'inactive' | null;
  city: string | null;
  district: string | null;
  keywords: string[];
};

const OFFER_ALIASES = new Set([
  'віддам',
  'віддаю',
  'подарую',
  'подарунок',
  'пропоную',
  'дарую',
  'безкоштовно',
]);

const LOOKING_ALIASES = new Set([
  'шукаю',
  'потрібно',
  'хочу',
  'треба',
  'пошук',
  'знайду',
  'підберу',
]);

const CATEGORY_ALIASES: Record<'indoor' | 'succulent' | 'other', string[]> = {
  indoor: ['кімнатна', 'кімнатні', 'кімнатне', 'домашня', 'домашні', 'для дому'],
  succulent: ['сукулент', 'сукуленти', 'ссукулент', 'ссукуленти', 'кактус', 'кактуси'],
  other: ['інше', 'інші', 'різне'],
};

const SIZE_ALIASES: Record<'small' | 'medium' | 'large', string[]> = {
  small: ['малий', 'мала', 'маленький', 'невеликий', 'маленька', 'маленьке', 'дрібний'],
  medium: ['середній', 'середня', 'середнє', 'середні', 'помірний'],
  large: ['великий', 'велика', 'велике', 'великі', 'крупний'],
};

const CONDITION_ALIASES: Record<'healthy' | 'needs-care', string[]> = {
  healthy: ['здоровий', 'здорова', 'здорове', 'без проблем', 'добрий стан'],
  'needs-care': ['потребує', 'догляд', 'хворий', 'хвора', 'хворе', 'слабкий', 'слабка'],
};

const CARE_LEVEL_ALIASES: Record<'easy' | 'medium' | 'hard', string[]> = {
  easy: ['легкий', 'легка', 'легке', 'простий', 'проста', 'невибагливий', 'невибаглива'],
  medium: ['середній', 'середня', 'середнє', 'помірний'],
  hard: ['складний', 'складна', 'складне', 'важкий', 'важка', 'вимогливий', 'вимоглива'],
};

const STATUS_ALIASES: Record<'active' | 'pending' | 'rejected' | 'inactive', string[]> = {
  active: ['активне', 'активний', 'діюче'],
  pending: ['очікує', 'очікування', 'на розгляді'],
  rejected: ['відхилено', 'відхилений', 'відмова'],
  inactive: ['неактивне', 'неактивний', 'неактивна', 'архів', 'архівний', 'завершене', 'неактуальне'],
};

const STOP_WORDS = new Set([
  'і',
  'та',
  'або',
  'для',
  'з',
  'у',
  'в',
  'на',
  'по',
  'це',
  'ця',
  'цею',
  'цей',
  'рослина',
  'рослини',
  'квітка',
  'квіти',
]);

const normalizeQuery = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const analyzeAnnouncementQuery = (raw: string | null | undefined): AnnouncementQueryNlp => {
  if (!raw || !raw.trim()) {
    return {
      normalizedQuery: null,
      offerType: null,
      category: null,
      size: null,
      condition: null,
      careLevel: null,
      status: null,
      city: null,
      district: null,
      keywords: [],
    };
  }

  const normalized = normalizeQuery(raw);
  if (!normalized) {
    return {
      normalizedQuery: null,
      offerType: null,
      category: null,
      size: null,
      condition: null,
      careLevel: null,
      status: null,
      city: null,
      district: null,
      keywords: [],
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const keywords = tokens.filter((token) => !STOP_WORDS.has(token));

  let offerType: AnnouncementQueryNlp['offerType'] = null;
  if (tokens.some((token) => OFFER_ALIASES.has(token))) {
    offerType = 'offer';
  }
  if (tokens.some((token) => LOOKING_ALIASES.has(token))) {
    offerType = 'looking-for';
  }

  const detectAlias = <T extends string>(aliases: Record<T, string[]>): T | null => {
    const entries = Object.entries(aliases) as Array<[T, string[]]>;
    for (const [key, values] of entries) {
      if (values.some((value) => tokens.includes(value))) {
        return key;
      }
    }
    return null;
  };

  const category = detectAlias(CATEGORY_ALIASES);
  const size = detectAlias(SIZE_ALIASES);
  const condition = detectAlias(CONDITION_ALIASES);
  const careLevel = detectAlias(CARE_LEVEL_ALIASES);
  const status = detectAlias(STATUS_ALIASES);

  const findAfter = (marker: string): string | null => {
    const index = tokens.indexOf(marker);
    if (index === -1 || index >= tokens.length - 1) return null;
    const next = tokens[index + 1];
    return next && !STOP_WORDS.has(next) ? next : null;
  };

  const city = findAfter('місто') ?? findAfter('город') ?? findAfter('city');
  const district = findAfter('район') ?? findAfter('district');

  const normalizedQuery = keywords.join(' ').trim();

  return {
    normalizedQuery: normalizedQuery.length > 0 ? normalizedQuery : normalized,
    offerType,
    category,
    size,
    condition,
    careLevel,
    status,
    city,
    district,
    keywords,
  };
};
