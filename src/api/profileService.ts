import { authService } from './authService';

export type Profile = {
  id?: string;
  name?: string;
  email?: string;
  city?: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  createdAt?: string | number;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  ratingSummary?: {
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
  interactionsSummary?: {
    activeCount?: number;
    completedCount?: number;
    cancelledCount?: number;
    totalCount?: number;
    lastExchangeAt?: string | null;
  };
  isProfileVerified?: boolean;
  trustScore?: number;
  reputationScore?: number;
  trustLevel?: string;
  activeAnnouncementsCount?: number;
  totalAnnouncementsCount?: number;
  isAccountOlderThan7Days?: boolean;
  hasActiveAnnouncements?: boolean;
  profileCompleted?: boolean;
  lastActiveAt?: string | number;
};

export type ProfileUpdatePayload = {
  name?: string;
  city?: string;
  bio?: string;
  avatar?: string;
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

export const profileService = {
  async getMe(): Promise<Profile> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/profile/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Не вдалося отримати профіль.'
      );
      throw new Error(message);
    }

    const data = (await response.json()) as { profile?: Profile } | Profile;
    if ('profile' in data && data.profile) {
      return data.profile;
    }
    return data as Profile;
  },

  async getById(userId: string): Promise<Profile> {
    const token = authService.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const requestProfile = async (url: string) =>
      fetch(url, {
        method: 'GET',
        headers,
      });

    let response = await requestProfile(`${API_BASE_URL}/profile/${userId}`);
    if (!response.ok && response.status === 404) {
      response = await requestProfile(`${API_BASE_URL}/users/${userId}`);
    }

    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Не вдалося отримати профіль користувача.'
      );
      throw new Error(message);
    }

    const data = (await response.json()) as { profile?: Profile; user?: Profile } | Profile;
    if ('profile' in data && data.profile) {
      return data.profile;
    }
    if ('user' in data && data.user) {
      return data.user;
    }
    return data as Profile;
  },

  async update(payload: ProfileUpdatePayload): Promise<Profile> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/profile/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Не вдалося оновити профіль.'
      );
      throw new Error(message);
    }

    const data = (await response.json()) as { profile?: Profile } | Profile;
    if ('profile' in data && data.profile) {
      return data.profile;
    }
    return data as Profile;
  },

  async remove(): Promise<void> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/profile/me`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await readResponseMessage(
        response,
        'Не вдалося видалити акаунт.'
      );
      throw new Error(message);
    }
  },
};
