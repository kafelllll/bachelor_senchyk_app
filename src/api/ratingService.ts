import { authService } from './authService';

export type RatingSummary = {
  averageRating?: number;
  ratingsCount?: number;
  completedExchangesCount?: number;
  latestReviews?: Array<{
    id?: string;
    score: number;
    comment?: string | null;
    createdAt?: string;
    fromUser?: { id: string; name?: string; avatar?: string | null };
  }>;
};

export type RatingCreatePayload = {
  exchangeId: string;
  score: number;
  comment?: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const readResponseMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    return data?.message || fallback;
  }

  const text = await response.text().catch(() => '');
  return text || fallback;
};

const ensureAuth = () => {
  const token = authService.getToken();
  if (!token) {
    throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
  }
  return token;
};

export const ratingService = {
  async getSummary(userId: string): Promise<RatingSummary> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/users/${userId}/ratings-summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати рейтинг.');
      throw new Error(message);
    }

    const payload = (await response.json()) as
      | RatingSummary
      | { summary?: RatingSummary; success?: boolean };
    if (payload && typeof payload === 'object' && 'summary' in payload && payload.summary) {
      return payload.summary as RatingSummary;
    }
    return payload as RatingSummary;
  },

  async create(payload: RatingCreatePayload): Promise<void> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/ratings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося надіслати оцінку.');
      throw new Error(message);
    }
  },
};
