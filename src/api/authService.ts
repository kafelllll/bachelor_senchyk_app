import {
  STORAGE_KEYS,
  readJsonStorageValue,
  readStorageValue,
  removeStorageValue,
  writeJsonStorageValue,
  writeStorageValue,
} from '../utils/storage';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  avatar?: string;
  city?: string;
  bio?: string;
  emailVerified?: boolean;
  createdAt?: string | number;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user?: User;
}

export interface VerifyEmailResponse {
  success?: boolean;
  message: string;
  token?: string;
  user?: User;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const AUTH_EVENT = 'auth-token-changed';

const getErrorMessage = async (response: Response): Promise<string> => {
  switch (response.status) {
    case 400:
      return 'Некоректні дані. Перевірте форму і спробуйте ще раз.';
    case 401:
      return 'Неправильна електронна адреса або пароль.';
    case 403:
      return 'Підтвердьте пошту перед входом.';
    case 409:
      return 'Акаунт з такою електронною адресою вже існує.';
    case 500:
      return 'Помилка сервера. Спробуйте пізніше.';
    case 503:
      return 'Сервер тимчасово недоступний. Спробуйте пізніше.';
    default:
      break;
  }

  try {
    const data = await response.json();
    if (data?.message) {
      return data.message;
    }
  } catch {
  }

  return 'Не вдалося виконати запит. Спробуйте ще раз.';
};

export const getNetworkErrorMessage = (error: unknown): string => {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    
    if (message.includes('fetch') || message.includes('network')) {
      return 'Помилка мережі. Перевірте своє інтернет з\'єднання.';
    }
    if (message.includes('timeout')) {
      return 'Часовий ліміт запиту вичерпано. Спробуйте ще раз.';
    }
    if (message.includes('cors')) {
      return 'Помилка безпеки при звернені до сервера. Спробуйте пізніше.';
    }
  }
  
  return 'Не вдалося підключитися до сервера. Спробуйте пізніше.';
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const message = await getErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const authService = {
  setToken(token: string) {
    writeStorageValue(STORAGE_KEYS.authToken, token);
    window.dispatchEvent(new Event(AUTH_EVENT));
  },

  getToken() {
    return readStorageValue(STORAGE_KEYS.authToken);
  },

  setUserId(userId: string) {
    writeStorageValue(STORAGE_KEYS.authUserId, userId);
  },

  setUserProfile(profile: Partial<User>) {
    writeJsonStorageValue(STORAGE_KEYS.authUserProfile, profile);
    window.dispatchEvent(new Event(AUTH_EVENT));
  },

  getUserProfile(): Partial<User> | null {
    return readJsonStorageValue<Partial<User>>(STORAGE_KEYS.authUserProfile);
  },

  getUserId() {
    return readStorageValue(STORAGE_KEYS.authUserId);
  },

  clearToken() {
    removeStorageValue(STORAGE_KEYS.authToken);
    removeStorageValue(STORAGE_KEYS.authUserId);
    removeStorageValue(STORAGE_KEYS.authUserProfile);
    window.dispatchEvent(new Event(AUTH_EVENT));
  },

  async register(data: RegisterPayload): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    return await handleResponse<AuthResponse>(response);
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    return await handleResponse<AuthResponse>(response);
  },

  async me(): Promise<User> {
    const token = authService.getToken();
    if (!token) {
      throw new Error('Ви не авторизовані. Будь ласка, увійдіть.');
    }

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await handleResponse<{ user?: User } | User>(response);
    if ('user' in data && data.user) {
      return data.user;
    }

    return data as User;
  },

  async logout(): Promise<void> {
    const token = authService.getToken();
    if (!token) {
      authService.clearToken();
      return;
    }

    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const message = await getErrorMessage(response);
      throw new Error(message);
    }
  },

  async verifyEmailToken(token: string): Promise<VerifyEmailResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    return await handleResponse<VerifyEmailResponse>(response);
  },

  async verifyEmailCode(code: string): Promise<VerifyEmailResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    return await handleResponse<VerifyEmailResponse>(response);
  },

  async verifyEmailLink(token: string): Promise<VerifyEmailResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return await handleResponse<VerifyEmailResponse>(response);
  },

  async resendVerification(email: string): Promise<{ success?: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    return await handleResponse<{ success?: boolean; message: string }>(response);
  },
};
