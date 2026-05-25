import DOMPurify from 'dompurify';

export const VALIDATION_LIMITS = {
  plantName: { min: 3, max: 100 },
  city: { min: 2, max: 50 },
  description: { max: 2000 },
  additionalTags: { max: 5 },
  district: { max: 50 },
} as const;

export const sanitizeInput = (input: string): string => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

export const isNullOrWhitespace = (value: unknown): boolean => {
  if (typeof value !== 'string') return true;
  return value.trim().length === 0;
};

export const validateEmail = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть електронну адресу.' };
  }

  const trimmed = value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Невірна електронна адреса.' };
  }

  return { valid: true };
};

export const validatePassword = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть пароль.' };
  }

  const trimmed = value.trim();

  if (trimmed.length < 6) {
    return { valid: false, error: 'Пароль має бути мінімум 6 символів.' };
  }

  if (trimmed.length > 128) {
    return { valid: false, error: 'Пароль має бути максимум 128 символів.' };
  }

  return { valid: true };
};

export const validateName = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть повне ім\'я.' };
  }

  const trimmed = value.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Ім\'я має бути мінімум 2 символи.' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Ім\'я має бути максимум 100 символів.' };
  }

  return { valid: true };
};

export const validateDistrict = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть район.' };
  }

  const trimmed = value.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Назва району має бути мінімум 2 символи.' };
  }

  if (trimmed.length > VALIDATION_LIMITS.district.max) {
    return { valid: false, error: `Назва району має бути максимум ${VALIDATION_LIMITS.district.max} символів.` };
  }

  return { valid: true };
};

export const normalizeCity = (value: string): string => {
  let normalized = value.trim();
  
  normalized = normalized.replace(/\s+/g, ' ');
  
  normalized = normalized.replace(/[^\p{L}\p{N}\s-]/gu, '');
  
  return normalized;
};

export const validateCity = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть місто.' };
  }

  const normalized = normalizeCity(value);

  if (normalized.length < VALIDATION_LIMITS.city.min) {
    return { valid: false, error: `Назва міста мінімум ${VALIDATION_LIMITS.city.min} символи.` };
  }

  if (normalized.length > VALIDATION_LIMITS.city.max) {
    return { valid: false, error: `Назва міста максимум ${VALIDATION_LIMITS.city.max} символів.` };
  }

  return { valid: true };
};

export const validatePlantName = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: false, error: 'Вкажіть назву рослини.' };
  }

  const trimmed = value.trim();

  if (trimmed.length < VALIDATION_LIMITS.plantName.min) {
    return { valid: false, error: `Назва рослини мінімум ${VALIDATION_LIMITS.plantName.min} символи.` };
  }

  if (trimmed.length > VALIDATION_LIMITS.plantName.max) {
    return { valid: false, error: `Назва рослини максимум ${VALIDATION_LIMITS.plantName.max} символів.` };
  }

  return { valid: true };
};

export const validateDescription = (value: string): { valid: boolean; error?: string } => {
  if (isNullOrWhitespace(value)) {
    return { valid: true };
  }

  const trimmed = value.trim();

  if (trimmed.length > VALIDATION_LIMITS.description.max) {
    return { valid: false, error: `Опис максимум ${VALIDATION_LIMITS.description.max} символів.` };
  }

  return { valid: true };
};


export const validateMinImages = (images: string[]): { valid: boolean; error?: string } => {
  if (images.length === 0) {
    return { valid: false, error: 'Додайте мінімум одне фото рослини.' };
  }

  return { valid: true };
};

export const validateHumidity = (value: unknown): { valid: boolean; error?: string } => {
  if (!value) return { valid: true };
  if (value === 'low' || value === 'medium' || value === 'high') {
    return { valid: true };
  }
  return { valid: false, error: 'Невірна вологість.' };
};

export const validateToxicity = (value: unknown): { valid: boolean; error?: string } => {
  if (!value) return { valid: true };
  if (value === 'non-toxic' || value === 'slightly-toxic' || value === 'toxic') {
    return { valid: true };
  }
  return { valid: false, error: 'Невірна токсичність.' };
};

export const validateGrowthRate = (value: unknown): { valid: boolean; error?: string } => {
  if (!value) return { valid: true };
  if (value === 'slow' || value === 'moderate' || value === 'fast') {
    return { valid: true };
  }
  return { valid: false, error: 'Невірна швидкість зростання.' };
};

export const validateAdditionalTags = (tags: string[]): { valid: boolean; error?: string } => {
  if (tags.length > VALIDATION_LIMITS.additionalTags.max) {
    return { valid: false, error: `Максимум ${VALIDATION_LIMITS.additionalTags.max} тегів.` };
  }
  return { valid: true };
};

export const validateExpiresAt = (value: string): { valid: boolean; error?: string } => {
  if (!value) {
    return { valid: true };
  }

  try {
    const date = new Date(value);
    const now = new Date();

    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Невірний формат дати.' };
    }

    if (date <= now) {
      return { valid: false, error: 'Дата експирації повинна бути в майбутньому.' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Невірна дата.' };
  }
};

export const validateCreateListing = (data: {
  plantName: string;
  category: unknown;
  size: unknown;
  condition: unknown;
  careLevel: unknown;
  city: string;
  wateringFreq: unknown;
  lightReqs: unknown;
  uploadedImages: string[];
  description?: string;
  listingType?: string;
  aiResultApplied?: boolean;
  humidity?: unknown;
  toxicity?: unknown;
  growthRate?: unknown;
  selectedTags?: string[];
}): { valid: boolean; error?: string } => {
  const plantNameValidation = validatePlantName(data.plantName);
  if (!plantNameValidation.valid) {
    return plantNameValidation;
  }

  if (!data.category) {
    return { valid: false, error: 'Оберіть категорію рослини.' };
  }

  if (!data.size) {
    return { valid: false, error: 'Оберіть розмір рослини.' };
  }

  if (!data.condition) {
    return { valid: false, error: 'Оберіть стан рослини.' };
  }

  if (!data.careLevel) {
    return { valid: false, error: 'Оберіть рівень догляду.' };
  }

  const cityValidation = validateCity(data.city);
  if (!cityValidation.valid) {
    return cityValidation;
  }

  if (!data.wateringFreq) {
    return { valid: false, error: 'Виберіть частоту поливу.' };
  }

  if (!data.lightReqs) {
    return { valid: false, error: 'Виберіть вимоги до світла.' };
  }

  const imagesValidation = validateMinImages(data.uploadedImages);
  if (!imagesValidation.valid) {
    return imagesValidation;
  }

  const humidityValidation = validateHumidity(data.humidity);
  if (!humidityValidation.valid) {
    return humidityValidation;
  }

  const toxicityValidation = validateToxicity(data.toxicity);
  if (!toxicityValidation.valid) {
    return toxicityValidation;
  }

  const growthRateValidation = validateGrowthRate(data.growthRate);
  if (!growthRateValidation.valid) {
    return growthRateValidation;
  }

  const tagsValidation = validateAdditionalTags(data.selectedTags ?? []);
  if (!tagsValidation.valid) {
    return tagsValidation;
  }

  if (data.description) {
    const descValidation = validateDescription(data.description);
    if (!descValidation.valid) {
      return descValidation;
    }
  }

  if (data.aiResultApplied === false) {
    return { valid: false, error: 'Натисніть "Використати результат", щоб застосувати дані рослини.' };
  }

  return { valid: true };
};

export const validateEditListing = (data: {
  plantName: string;
  category: unknown;
  size: unknown;
  condition: unknown;
  careLevel: unknown;
  city: string;
  wateringFreq: unknown;
  lightReqs: unknown;
  imagePreviews: string[];
  description?: string;
  listingType?: string;
  humidity?: unknown;
  toxicity?: unknown;
  growthRate?: unknown;
  selectedTags?: string[];
}): { valid: boolean; error?: string } => {
  const plantNameValidation = validatePlantName(data.plantName);
  if (!plantNameValidation.valid) {
    return plantNameValidation;
  }

  if (!data.category) {
    return { valid: false, error: 'Оберіть категорію рослини.' };
  }

  if (!data.size) {
    return { valid: false, error: 'Оберіть розмір рослини.' };
  }

  if (!data.condition) {
    return { valid: false, error: 'Оберіть стан рослини.' };
  }

  if (!data.careLevel) {
    return { valid: false, error: 'Оберіть рівень догляду.' };
  }

  const cityValidation = validateCity(data.city);
  if (!cityValidation.valid) {
    return cityValidation;
  }

  if (!data.wateringFreq) {
    return { valid: false, error: 'Оберіть частоту поливу.' };
  }

  if (!data.lightReqs) {
    return { valid: false, error: 'Оберітьвимоги до світла.' };
  }

  const imagesValidation = validateMinImages(data.imagePreviews);
  if (!imagesValidation.valid) {
    return imagesValidation;
  }

  const humidityValidation = validateHumidity(data.humidity);
  if (!humidityValidation.valid) {
    return humidityValidation;
  }

  const toxicityValidation = validateToxicity(data.toxicity);
  if (!toxicityValidation.valid) {
    return toxicityValidation;
  }

  const growthRateValidation = validateGrowthRate(data.growthRate);
  if (!growthRateValidation.valid) {
    return growthRateValidation;
  }

  const tagsValidation = validateAdditionalTags(data.selectedTags ?? []);
  if (!tagsValidation.valid) {
    return tagsValidation;
  }

  if (data.description) {
    const descValidation = validateDescription(data.description);
    if (!descValidation.valid) {
      return descValidation;
    }
  }

  return { valid: true };
};
