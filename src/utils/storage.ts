export const STORAGE_KEYS = {
  authToken: 'auth_token',
  authUserId: 'auth_user_id',
  authUserProfile: 'auth_user_profile',
  listingsFilters: 'plantmatch.listings.filters',
  matchesFilters: 'plantmatch.matches.filters',
  exchangesFilters: 'plantmatch.exchanges.filters',
  activeConversation: 'pm_active_conversation',
} as const;

const readLocalStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
  }
};

const removeLocalStorage = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
  }
};

export const readStorageValue = (key: string): string | null => readLocalStorage(key);

export const writeStorageValue = (key: string, value: string) => {
  writeLocalStorage(key, value);
};

export const removeStorageValue = (key: string) => {
  removeLocalStorage(key);
};

export const readJsonStorageValue = <T>(key: string): T | null => {
  const raw = readLocalStorage(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const writeJsonStorageValue = (key: string, value: unknown) => {
  writeLocalStorage(key, JSON.stringify(value));
};