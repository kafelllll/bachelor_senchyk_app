import { authService } from './authService';

export type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  announcementId: string | null;
  announcementTitle?: string | null;
  announcement?: { id?: string; plantName?: string } | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  sender: { id: string; name: string; avatar: string | null };
  receiver: { id: string; name: string; avatar: string | null };
};

export type Conversation = {
  participant: {
    id: string;
    name: string;
    avatar: string | null;
    averageRating?: number | null;
    ratingsCount?: number | null;
    completedExchangesCount?: number | null;
    rating?: { averageRating?: number | null; ratingsCount?: number | null } | null;
  };
  announcement?: { id?: string; plantName?: string } | null;
  lastMessage?: Message;
  unreadCount: number;
};

export type CreateMessagePayload = {
  receiverId: string;
  announcementId?: string | null;
  content: string;
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

export const messageService = {
  async createMessage(payload: CreateMessagePayload): Promise<Message> {
    const token = ensureAuth();

    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося надіслати повідомлення.');
      throw new Error(message);
    }

    const data = (await response.json()) as { message?: Message };
    if (data?.message) {
      return data.message;
    }

    return data as Message;
  },

  async getMessages(params: { userId: string; limit?: number }): Promise<Message[]> {
    const token = ensureAuth();
    const searchParams = new URLSearchParams({ userId: params.userId });
    if (params.limit) {
      searchParams.set('limit', String(params.limit));
    }

    const response = await fetch(`${API_BASE_URL}/messages?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати повідомлення.');
      throw new Error(message);
    }

    const data = (await response.json()) as { messages?: Message[] } | Message[];
    if (Array.isArray(data)) return data;
    return data?.messages ?? [];
  },

  async listConversations(limit?: number): Promise<Conversation[]> {
    const token = ensureAuth();
    const searchParams = new URLSearchParams();
    if (limit) {
      searchParams.set('limit', String(limit));
    }

    const query = searchParams.toString();
    const response = await fetch(
      `${API_BASE_URL}/messages/conversations${query ? `?${query}` : ''}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати діалоги.');
      throw new Error(message);
    }

    const data = (await response.json()) as { conversations?: Conversation[] } | Conversation[];
    if (Array.isArray(data)) return data;
    return data?.conversations ?? [];
  },

  async deleteConversation(params: { userId: string }): Promise<number> {
    const token = ensureAuth();
    const searchParams = new URLSearchParams({ userId: params.userId });

    const response = await fetch(`${API_BASE_URL}/messages?${searchParams.toString()}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося видалити діалог.');
      throw new Error(message);
    }

    const data = (await response.json()) as { deletedCount?: number };
    return data?.deletedCount ?? 0;
  },

  async getUnreadCount(): Promise<number> {
    const token = ensureAuth();
    const response = await fetch(`${API_BASE_URL}/messages/unread-count`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(response, 'Не вдалося отримати кількість повідомлень.');
      throw new Error(message);
    }

    const data = (await response.json()) as { unreadCount?: number };
    return data?.unreadCount ?? 0;
  },
};
