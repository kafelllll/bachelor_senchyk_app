import { authService } from './authService';

export type OfferType = 'offer' | 'looking-for';
export type Category = 'indoor' | 'succulent' | 'other';
export type Size = 'small' | 'medium' | 'large';
export type Condition = 'healthy' | 'needs-care';
export type CareLevel = 'easy' | 'medium' | 'hard';
export type WateringFreq = 'rare' | 'moderate' | 'frequent';
export type LightReqs = 'bright' | 'partial' | 'shade';
export type Humidity = 'low' | 'medium' | 'high';
export type Toxicity = 'non-toxic' | 'slightly-toxic' | 'toxic';
export type GrowthRate = 'slow' | 'moderate' | 'fast';

export type ListingPayload = {
  plantName: string;
  offerType: OfferType;
  category: Category;
  size: Size;
  condition: Condition;
  careLevel: CareLevel;
  city: string;
  genus: string;
  family: string;
  commonName: string;
  description?: string;
  additionalTags?: string[];
  district?: string;
  pestFree?: boolean;
  readyToExchange?: boolean;
  imageUrl?: string;
  images?: string[];
  photoUrl?: string;
  photoKey?: string;
  photo?: string;
  wateringFreq: WateringFreq;
  lightReqs: LightReqs;
  humidity?: Humidity;
  toxicity?: Toxicity;
  growthRate?: GrowthRate;
  hasOffspring?: boolean;
  userName?: string;
};

export type ListingUpdatePayload = ListingPayload;

export type AnnouncementResponse = {
  success: boolean;
  announcement: Record<string, unknown>;
};

export type AnnouncementListResponse = {
  announcements?: unknown[];
  data?: unknown[];
} | unknown[];

export type AnnouncementSearchResponse = {
  items?: unknown[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export type AnnouncementMatchesResponse = {
  success: boolean;
  matches: AnnouncementMatch[];
  message?: string;
};

export type MatchLevel = 'high' | 'medium' | 'low';

export type AnnouncementMatch = {
  id: string;
  userId: string;
  plantName: string | null;
  city: string | null;
  district: string | null;
  size: 'small' | 'medium' | 'large' | string | null;
  condition: 'healthy' | 'needs-care' | string | null;
  careLevel: 'easy' | 'medium' | 'hard' | string | null;
  status: 'active' | 'inactive' | string;
  score: number;
  matchLevel: MatchLevel;
  createdAt: string;
  image?: string | null;
  coverPhoto?: string | null;
  photos?: string[];
};

export type AnnouncementValidationIssue = {
  code?: string;
  path?: unknown[];
  message?: string;
};

export class AnnouncementServiceError extends Error {
  status?: number;
  issues?: AnnouncementValidationIssue[];

  constructor(message: string, status?: number, issues?: AnnouncementValidationIssue[]) {
    super(message);
    this.name = 'AnnouncementServiceError';
    this.status = status;
    this.issues = issues;
  }
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const RECOMMENDATIONS_PATH =
  import.meta.env.VITE_MATCHES_ENDPOINT ?? '/announcements/recommendations';

const buildUrl = (path: string) =>
  path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${API_BASE_URL}${path}`;

const extractValidationIssues = (data: unknown): AnnouncementValidationIssue[] => {
  if (!data || typeof data !== 'object') return [];
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .filter((item): item is AnnouncementValidationIssue => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      code: typeof item.code === 'string' ? item.code : undefined,
      path: Array.isArray(item.path) ? item.path : undefined,
      message: typeof item.message === 'string' ? item.message : undefined,
    }));
};

const resolveErrorMessageFromPayload = (
  data: unknown,
  status: number,
  fallback: string
): string => {
  const issues = extractValidationIssues(data);
  const firstIssueMessage = issues.find((issue) => typeof issue.message === 'string')?.message;
  if (firstIssueMessage) return firstIssueMessage;
  if (data && typeof data === 'object') {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return getLocalizedErrorMessage(status, fallback);
};

const getLocalizedErrorMessage = (status: number, fallback: string): string => {
  switch (status) {
    case 400:
      return 'Некоректні дані. Перевірте форму та спробуйте ще раз.';
    case 401:
      return 'Ви не авторизовані. Увійдіть у свій акаунт та спробуйте ще раз.';
    case 403:
      return 'У вас немає прав доступу до цього оголошення.';
    case 404:
      return 'Оголошення не знайдено або воно було видалено.';
    case 409:
      return 'Це оголошення вже існує або конфліктує з іншим.';
    case 500:
      return 'Помилка сервера. Спробуйте пізніше.';
    case 503:
      return 'Сервер тимчасово недоступний. Спробуйте пізніше.';
    default:
      return fallback;
  }
};

const readResponseMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    return resolveErrorMessageFromPayload(data, response.status, fallback);
  }

  const text = await response.text().catch(() => '');
  if (text && /<\s*html/i.test(text)) {
    return getLocalizedErrorMessage(response.status, fallback);
  }
  return text || getLocalizedErrorMessage(response.status, fallback);
};

const toServiceError = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    const message = resolveErrorMessageFromPayload(data, response.status, fallback);
    const issues = extractValidationIssues(data);
    return new AnnouncementServiceError(message, response.status, issues);
  }
  const message = await readResponseMessage(response, fallback);
  return new AnnouncementServiceError(message, response.status);
};

const extractAnnouncements = (payload: AnnouncementListResponse): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as {
      announcements?: unknown;
      data?: unknown;
      result?: unknown;
    };
    if (Array.isArray(record.announcements)) return record.announcements;
    if (Array.isArray(record.data)) return record.data;
    if (record.data && typeof record.data === 'object') {
      const nested = record.data as { announcements?: unknown; data?: unknown };
      if (Array.isArray(nested.announcements)) return nested.announcements;
      if (Array.isArray(nested.data)) return nested.data;
    }
    if (record.announcements && typeof record.announcements === 'object') {
      const nested = record.announcements as { data?: unknown; items?: unknown };
      if (Array.isArray(nested.data)) return nested.data;
      if (Array.isArray(nested.items)) return nested.items;
    }
    if (record.result && typeof record.result === 'object') {
      const nested = record.result as { announcements?: unknown; data?: unknown };
      if (Array.isArray(nested.announcements)) return nested.announcements;
      if (Array.isArray(nested.data)) return nested.data;
    }
  }
  return [];
};

const fetchMine = async (): Promise<AnnouncementListResponse> => {
  const token = authService.getToken();
  if (!token) {
    throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
  }

  const response = await fetch(`${API_BASE_URL}/announcements/me`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося отримати оголошення.');
    }

  return (await response.json()) as AnnouncementListResponse;
};

export const announcementService = {
  async create(payload: ListingPayload): Promise<AnnouncementResponse> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/announcements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = resolveErrorMessageFromPayload(
        data,
        response.status,
        'Не вдалося створити оголошення.'
      );
      const issues = extractValidationIssues(data);
      throw new AnnouncementServiceError(message, response.status, issues);
    }

    return (await response.json()) as AnnouncementResponse;
  },

  async list(): Promise<AnnouncementListResponse> {
    const token = authService.getToken();
    const response = await fetch(`${API_BASE_URL}/announcements`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося отримати оголошення.');
    }

    return (await response.json()) as AnnouncementListResponse;
  },

  async listRecommendations(): Promise<AnnouncementListResponse> {
    const token = authService.getToken();
    const response = await fetch(buildUrl(RECOMMENDATIONS_PATH), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося отримати рекомендації.');
    }

    return (await response.json()) as AnnouncementListResponse;
  },

  async listMatchesByAnnouncementId(id: string): Promise<AnnouncementMatchesResponse> {
    const token = authService.getToken();
    const response = await fetch(`${API_BASE_URL}/announcements/${id}/matches`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося отримати рекомендовані збіги.');
    }

    return (await response.json()) as AnnouncementMatchesResponse;
  },

  async listMine(): Promise<AnnouncementListResponse> {
    return fetchMine();
  },

  async search(params: Record<string, string | number | undefined>): Promise<AnnouncementSearchResponse> {
    const token = authService.getToken();
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === '') return;
      searchParams.set(key, String(value));
    });

    const response = await fetch(`${API_BASE_URL}/announcements/search?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося виконати пошук оголошень.');
    }

    return (await response.json()) as AnnouncementSearchResponse;
  },

  async getById(id: string): Promise<Record<string, unknown>> {
    const mine = await fetchMine();
      const list = extractAnnouncements(mine);
    const match = list.find((item) =>
      item && typeof item === 'object'
        ? String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>)._id) ===
          String(id)
        : false
    ) as Record<string, unknown> | undefined;

    if (match) {
      return match;
    }

    const token = authService.getToken();
    const response = await fetch(`${API_BASE_URL}/announcements/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося отримати оголошення.');
    }

    return (await response.json()) as Record<string, unknown>;
  },

  async update(id: string, payload: ListingUpdatePayload | Record<string, unknown>): Promise<Record<string, unknown>> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const request = async (method: 'PUT' | 'PATCH') =>
      fetch(`${API_BASE_URL}/announcements/${id}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

    let response = await request('PUT');
    if (!response.ok) {
      response = await request('PATCH');
    }

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося оновити оголошення.');
    }

    return (await response.json()) as Record<string, unknown>;
  },

  async remove(id: string): Promise<{ success: boolean } | Record<string, unknown>> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/announcements/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await toServiceError(response, 'Не вдалося видалити оголошення.');
    }

    return (await response.json().catch(() => ({ success: true }))) as
      | { success: boolean }
      | Record<string, unknown>;
  },
};


