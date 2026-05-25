import { authService } from './authService';

export type ExchangeStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

export type ExchangeParty = {
  id: string;
  name?: string;
  avatar?: string | null;
  averageRating?: number | null;
  ratingsCount?: number | null;
  completedExchangesCount?: number | null;
};

export type ExchangeParticipant = ExchangeParty & {
  role?: 'initiator' | 'receiver';
};

export type ExchangeAnnouncement = {
  id: string;
  userId?: string;
  plantName?: string;
  previewPhoto?: string;
  image?: string;
  images?: string[];
  type?: string;
  location?: string;
  city?: string;
  district?: string;
  category?: string;
  size?: string;
  condition?: string;
  careLevel?: string;
  description?: string;
};

export type ExchangeItem = {
  id: string;
  status: ExchangeStatus;
  createdAt?: string;
  completedAt?: string | null;
  initiatorCompletedAt?: string | null;
  receiverCompletedAt?: string | null;
  completionRole?: 'seeker' | 'giver';
  canConfirmCompletion?: boolean;
  completionConfirmedByCurrentUser?: boolean;
  completionConfirmedByOtherUser?: boolean;
  ratingRequired?: boolean;
  ratingTarget?: {
    id: string;
    name?: string;
    avatar?: string | null;
    rating?: number | null;
  } | null;
  interlocutor?: ExchangeParty;
  announcement?: ExchangeAnnouncement;
  initiator?: ExchangeParticipant;
  receiver?: ExchangeParticipant;
  initiatorId?: string;
  receiverId?: string;
  requesterId?: string;
  ownerId?: string;
  createdBy?: string;
};

export type ExchangeHistory = {
  active?: ExchangeItem[];
  completed?: ExchangeItem[];
  cancelled?: ExchangeItem[];
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const translateExchangeMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('exchange already exists')) {
    return 'Обмін уже існує.';
  }
  if (normalized.includes('invalid status transition')) {
    return 'Неможливо змінити статус обміну цією дією.';
  }
  if (normalized.includes('seeker must confirm completion first')) {
    return 'Поки ви не можете підтвердити завершення. Спочатку це має зробити користувач, який шукає рослину.';
  }
  if (normalized.includes('exchange must be accepted before completion confirmation')) {
    return 'Підтвердження завершення доступне лише для прийнятого обміну.';
  }
  if (normalized.includes('completion already confirmed by this user')) {
    return 'Ви вже підтвердили завершення цього обміну.';
  }
  if (normalized.includes('exchange already completed')) {
    return 'Обмін уже завершено.';
  }
  return message;
};

const readResponseMessage = async (response: Response, fallback: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    return translateExchangeMessage(data?.message || fallback);
  }

  const text = await response.text().catch(() => '');
  return translateExchangeMessage(text || fallback);
};

const ensureAuth = () => {
  const token = authService.getToken();
  if (!token) {
    throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
  }
  return token;
};
const resolveExchangeFromPayload = (payload: unknown): ExchangeItem => {
  if (payload && typeof payload === 'object') {
    const record = payload as { exchange?: unknown; data?: unknown; result?: unknown };
    const candidate = record.exchange ?? record.data ?? record.result ?? payload;
    if (candidate && typeof candidate === 'object') {
      return candidate as ExchangeItem;
    }
  }
  throw new Error('Некоректна відповідь сервера обміну.');
};

export const exchangeService = {
  async create(payload: { announcementId: string; receiverId?: string }): Promise<ExchangeItem> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося створити обмін.');
      throw new Error(message);
    }

    return resolveExchangeFromPayload(await response.json());
  },

  async updateStatus(id: string, status: ExchangeStatus): Promise<ExchangeItem> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося оновити статус обміну.');
      throw new Error(message);
    }

    return resolveExchangeFromPayload(await response.json());
  },

  async confirmCompletion(id: string): Promise<ExchangeItem> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges/${id}/confirm-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося підтвердити завершення обміну.');
      throw new Error(message);
    }

    return resolveExchangeFromPayload(await response.json());
  },

  async listMine(): Promise<ExchangeItem[]> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges/my`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

      if (!response.ok) {
        const message = await readResponseMessage(response, 'Не вдалося отримати ваші обміни.');
      throw new Error(message);
    }

    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) {
      return payload as ExchangeItem[];
    }

    if (payload && typeof payload === 'object') {
      const record = payload as {
        exchanges?: unknown;
        data?: unknown;
        items?: unknown;
        result?: unknown;
      };
      const list =
        record.exchanges ??
        record.items ??
        record.data ??
        record.result ??
        [];
      if (Array.isArray(list)) {
        return list as ExchangeItem[];
      }
    }

    return [];
  },

  async history(): Promise<ExchangeHistory> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати історію обмінів.');
      throw new Error(message);
    }

    return (await response.json()) as ExchangeHistory;
  },

  async getPendingCount(): Promise<number> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/exchanges/pending-count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати кількість очікуваних обмінів.');
      throw new Error(message);
    }

    const data = (await response.json()) as { pendingCount?: number } | number;
    if (typeof data === 'number') return data;
    return data?.pendingCount ?? 0;
  },
};


