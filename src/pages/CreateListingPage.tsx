import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Leaf, MapPin, Scan, Search, Upload, X } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import AppHeader from '../components/AppHeader';
import OptionGroup from '../components/OptionGroup';
import UploadImage from '../components/UploadImage';
import {
  AnnouncementServiceError,
  announcementService,
  type WateringFreq,
  type LightReqs,
  type Humidity,
  type Toxicity,
  type GrowthRate,
} from '../api/announcementService';
import { authService } from '../api/authService';
import { plantIdentifyService } from '../api/plantIdentifyService';
import { plantNetService } from '../api/plantNetService';
import {
  buildDigitErrorMessages,
  mapServerFieldErrors,
  setNoDigitsFieldValue as applyNoDigitsFieldValue,
} from '../utils/announcementForm';
import { validateCreateListing, normalizeCity, VALIDATION_LIMITS, validatePlantName, validateCity, validateDescription, sanitizeInput } from '../utils/validation';
import { getNetworkErrorMessage } from '../utils/networkError';

type ListingType = 'offer' | 'search';
type PlantCategory = 'indoor' | 'succulent' | 'other' | null;
type PlantSize = 'small' | 'medium' | 'large' | null;
type PlantCondition = 'healthy' | 'needs-care' | null;
type CareLevel = 'easy' | 'medium' | 'hard' | null;
type WateringFreqType = WateringFreq | null;
type LightReqsType = LightReqs | null;
type HumidityType = Humidity | null;
type ToxicityType = Toxicity | null;
type GrowthRateType = GrowthRate | null;

type AdditionalTag =
  | 'Квітуча'
  | 'Швидкозростаюча'
  | 'Повітроочищувальна'
  | 'Рідкісна'
  | 'Для новачків';

interface AIResult {
  plantName: string;
  commonName?: string;
  scientificName?: string;
  genus?: string;
  family?: string;
  confidence: number;
  referenceImageUrl?: string;
}

type NameSuggestion = {
  plantName: string;
  commonName?: string;
  scientificName?: string;
  genus?: string;
  family?: string;
  imageUrl?: string;
};

type IdentifySuggestion = {
  name: string;
  probability?: number;
  url?: string;
  raw?: Record<string, unknown>;
};

const categoryOptions = [
  { value: 'indoor', label: 'Кімнатна' },
  { value: 'succulent', label: 'Сукулент' },
  { value: 'other', label: 'Інше' },
] as const;

const sizeOptions = [
  { value: 'small', label: 'Малий' },
  { value: 'medium', label: 'Середній' },
  { value: 'large', label: 'Великий' },
] as const;

const conditionOptions = [
  { value: 'healthy', label: 'Здорова' },
  { value: 'needs-care', label: 'Потребує догляду' },
] as const;

const careLevelOptions = [
  { value: 'easy', label: 'Легкий' },
  { value: 'medium', label: 'Середній' },
  { value: 'hard', label: 'Складний' },
] as const;

const wateringFreqOptions = [
  { value: 'rare' as const, label: 'Рідко' },
  { value: 'moderate' as const, label: 'Помірно' },
  { value: 'frequent' as const, label: 'Часто' },
] as const;

const lightReqsOptions = [
  { value: 'bright' as const, label: 'Яскраве світло' },
  { value: 'partial' as const, label: 'Часткова тінь' },
  { value: 'shade' as const, label: 'Тінь' },
] as const;

const humidityOptions = [
  { value: 'low' as const, label: 'Низька' },
  { value: 'medium' as const, label: 'Середня' },
  { value: 'high' as const, label: 'Висока' },
] as const;

const toxicityOptions = [
  { value: 'non-toxic' as const, label: 'Нетоксична' },
  { value: 'slightly-toxic' as const, label: 'Слабко токсична' },
  { value: 'toxic' as const, label: 'Токсична' },
] as const;

const growthRateOptions = [
  { value: 'slow' as const, label: 'Повільно' },
  { value: 'moderate' as const, label: 'Помірно' },
  { value: 'fast' as const, label: 'Швидко' },
] as const;

const additionalTags: AdditionalTag[] = [
  'Квітуча',
  'Швидкозростаюча',
  'Повітроочищувальна',
  'Рідкісна',
  'Для новачків',
];

const MAX_IMAGES = 5;
const createFieldLabels = {
  plantName: 'Назва рослини',
  city: 'Місто',
  district: 'Район',
} as const;
type CreateFieldErrorKey = keyof typeof createFieldLabels;
const createFieldNames = Object.keys(createFieldLabels) as CreateFieldErrorKey[];
const digitErrorMessages = buildDigitErrorMessages(createFieldLabels);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const readImageData = (
  file: File
): Promise<{ base64: string; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ base64, dataUrl: result });
    };
    reader.onerror = () => reject(new Error('Не вдалося зчитати файл.'));
    reader.readAsDataURL(file);
  });

const normalizeConfidence = (value?: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
};

const pickString = (...values: Array<unknown>): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim() !== '');

const pickFirstString = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.find(
    (item): item is string => typeof item === 'string' && item.trim() !== ''
  );
};

const buildAiResultFromSuggestion = (
  suggestion: Record<string, unknown>,
  referenceImageUrl?: string
): AIResult => {
  const confidence = normalizeConfidence(suggestion.probability as number | undefined);
  const plantName =
    pickString(
      suggestion.name_uk,
      suggestion.nameUk,
      suggestion.name_ua,
      suggestion.nameUa,
      suggestion.name
    ) ?? 'Невідомо';
  const details = suggestion.details as Record<string, unknown> | undefined;
  const taxonomy = details?.taxonomy as Record<string, string> | undefined;
  const taxonomyUk =
    (details?.taxonomy_uk as Record<string, string> | undefined) ??
    (details?.taxonomyUk as Record<string, string> | undefined) ??
    (details?.taxonomy_ua as Record<string, string> | undefined) ??
    (details?.taxonomyUa as Record<string, string> | undefined);
  const commonNames =
    (details?.common_names_uk as string[] | undefined) ??
    (details?.commonNamesUk as string[] | undefined) ??
    (details?.common_names_ua as string[] | undefined) ??
    (details?.commonNamesUa as string[] | undefined) ??
    (details?.common_names as string[] | undefined) ??
    (details?.commonNames as string[] | undefined) ??
    [];
  const commonName = pickFirstString(commonNames);
  const genusFromName = plantName.split(' ')[0];
  const scientificName = pickString(
    suggestion.scientific_name_uk,
    suggestion.scientificNameUk,
    suggestion.scientific_name_ua,
    suggestion.scientificNameUa,
    suggestion.scientific_name,
    suggestion.scientificName,
    plantName
  );
  const genus = pickString(
    taxonomyUk?.genus,
    taxonomy?.genus,
    details?.genus_uk as string | undefined,
    details?.genusUk as string | undefined,
    details?.genus_ua as string | undefined,
    details?.genusUa as string | undefined,
    details?.genus as string | undefined,
    genusFromName
  );
  const family = pickString(
    taxonomyUk?.family,
    taxonomy?.family,
    details?.family_uk as string | undefined,
    details?.familyUk as string | undefined,
    details?.family_ua as string | undefined,
    details?.familyUa as string | undefined,
    details?.family as string | undefined
  );

  return {
    plantName,
    commonName,
    scientificName,
    genus,
    family,
    confidence: confidence || 70,
    referenceImageUrl,
  };
};

const resolveIdentifyResult = (payload: unknown): {
  result: AIResult | null;
  suggestions: IdentifySuggestion[];
} => {
  if (!payload || typeof payload !== 'object') {
    return { result: null, suggestions: [] };
  }

  const record = payload as Record<string, unknown>;
  const resultWrapper = record.result as Record<string, unknown> | undefined;
  const input = resultWrapper?.input as Record<string, unknown> | undefined;
  const inputImages = (input?.images as string[] | undefined) ?? [];
  const referenceImageUrl = inputImages[0];
  const innerResult = resultWrapper?.result as Record<string, unknown> | undefined;
  const classification = innerResult?.classification as Record<string, unknown> | undefined;
  const suggestionsRaw = classification?.suggestions as Array<Record<string, unknown>> | undefined;

  const suggestions = (suggestionsRaw ?? []).map((item) => ({
    name:
      pickString(item.name_uk, item.nameUk, item.name_ua, item.nameUa, item.name) ??
      'Невідомо',
    probability: item.probability as number | undefined,
    url: undefined,
    raw: item,
  }));

  const primary = suggestionsRaw?.[0];
  if (!primary) {
    return { result: null, suggestions };
  }

  return {
    result: buildAiResultFromSuggestion(primary, referenceImageUrl),
    suggestions,
  };
};

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [listingType, setListingType] = useState<ListingType>('offer');
  const [plantName, setPlantName] = useState('');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResultApplied, setAiResultApplied] = useState(false);
  const [identifySuggestions, setIdentifySuggestions] = useState<IdentifySuggestion[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<NameSuggestion[]>([]);
  const [identifyPreviewUrl, setIdentifyPreviewUrl] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<'photo' | 'name' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateFieldErrorKey, string>>>({});

  const [category, setCategory] = useState<PlantCategory>(null);
  const [size, setSize] = useState<PlantSize>(null);
  const [condition, setCondition] = useState<PlantCondition>(null);
  const [careLevel, setCareLevel] = useState<CareLevel>(null);

  const [selectedTags, setSelectedTags] = useState<AdditionalTag[]>([]);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedImageKeys, setUploadedImageKeys] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string>('');
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [wateringFreq, setWateringFreq] = useState<WateringFreqType>(null);
  const [lightReqs, setLightReqs] = useState<LightReqsType>(null);
  const [humidity, setHumidity] = useState<HumidityType>(null);
  const [toxicity, setToxicity] = useState<ToxicityType>(null);
  const [growthRate, setGrowthRate] = useState<GrowthRateType>(null);
  const [hasOffspring, setHasOffspring] = useState(false);
  const [pestFree, setPestFree] = useState(false);
  const [readyToExchange, setReadyToExchange] = useState(false);

  const aiUploadRef = useRef<HTMLInputElement | null>(null);

  const setNoDigitsFieldValue = (
    field: CreateFieldErrorKey,
    rawValue: string,
    setValue: (value: string) => void,
    maxLength?: number
  ) => {
    applyNoDigitsFieldValue({
      field,
      rawValue,
      setValue,
      setSubmitError,
      setFieldErrors,
      digitErrorMessages,
      maxLength,
    });
  };

  const confidenceLabel = useMemo(() => {
    if (!aiResult) return '';
    if (aiResult.confidence >= 90) return 'Висока точність';
    if (aiResult.confidence >= 75) return 'Добра точність';
    return 'Потребує перевірки';
  }, [aiResult]);

  const handleNameRecognition = async () => {
    if (!plantName.trim()) {
      setAiError('Введіть назву рослини для пошуку.');
      return;
    }

    setAiError(null);
    setAiLoading(true);
    setAiResult(null);
    setAiResultApplied(false);
    setIdentifySuggestions([]);
    setNameSuggestions([]);
    setIdentifyPreviewUrl(null);
    setAiSource('name');

    try {
      const results = await plantNetService.searchByName(plantName.trim());
      const plant = results[0];

      if (!plant) {
        setAiError('Нічого не знайдено за цією назвою.');
        return;
      }

      const resolvedName = plant.common_name || plant.scientific_name || plantName;

      setNameSuggestions(
        results
          .slice(1, 4)
          .map((item) => ({
            plantName: item.common_name || item.scientific_name || resolvedName,
            commonName: item.common_name,
            scientificName: item.scientific_name,
            genus: item.genus,
            family: item.family,
            imageUrl: item.image_url,
          }))
      );

      setAiResult({
        plantName: resolvedName,
        commonName: plant.common_name,
        scientificName: plant.scientific_name,
        genus: plant.genus,
        family: plant.family,
        referenceImageUrl: plant.image_url,
        confidence: 80,
      });
    } catch (err) {
      if (err instanceof Error && err.message) {
        setAiError(err.message);
      } else {
        setAiError(getNetworkErrorMessage(err));
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handlePickNameSuggestion = (suggestion: NameSuggestion) => {
    setAiSource('name');
    setAiError(null);
    setAiResultApplied(false);
    setAiResult({
      plantName: suggestion.plantName,
      commonName: suggestion.commonName,
      scientificName: suggestion.scientificName,
      genus: suggestion.genus,
      family: suggestion.family,
      referenceImageUrl: suggestion.imageUrl,
      confidence: 80,
    });
    setPlantName(suggestion.plantName);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.plantName;
      return next;
    });
  };

  const handleUseAIResult = () => {
    if (!aiResult) return;
    setPlantName(aiResult.plantName);
    setAiResultApplied(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.plantName;
      return next;
    });
  };

  const resetListingForm = () => {
    setListingType('offer');
    setPlantName('');
    setAiResult(null);
    setAiError(null);
    setAiLoading(false);
    setAiResultApplied(false);
    setIdentifySuggestions([]);
    setNameSuggestions([]);
    setIdentifyPreviewUrl(null);
    setAiSource(null);
    setCategory(null);
    setSize(null);
    setCondition(null);
    setCareLevel(null);
    setSelectedTags([]);
    setCity('');
    setDistrict('');
    setDescription('');
    setUploadedImages([]);
    setUploadedImageKeys([]);
    setCoverImage('');
    setImageUploadError(null);
    setPestFree(false);
    setReadyToExchange(false);
    setWateringFreq(null);
    setLightReqs(null);
    setHumidity(null);
    setToxicity(null);
    setGrowthRate(null);
    setHasOffspring(false);
    setSubmitError(null);
    setSubmitSuccess(null);
    setFieldErrors({});
  };

  const handleClearAiResult = () => {
    setAiResult(null);
    setAiResultApplied(false);
  };

  const handlePickIdentifySuggestion = (suggestion: IdentifySuggestion) => {
    if (!suggestion.raw) return;
    setAiSource('photo');
    setAiError(null);
    setAiResultApplied(false);
    setAiResult(buildAiResultFromSuggestion(suggestion.raw, identifyPreviewUrl ?? undefined));
  };

  const handleImageUpload = (imageUrl: string, imageKey: string) => {
    setImageUploadError(null);
    if (uploadedImages.length >= MAX_IMAGES) {
      setImageUploadError(`Можна додати максимум ${MAX_IMAGES} фото.`);
      return;
    }
    setUploadedImages((prev) =>
      prev.includes(imageUrl) ? prev : [...prev, imageUrl]
    );
    if (imageKey) {
      setUploadedImageKeys((prev) =>
        prev.includes(imageKey) ? prev : [...prev, imageKey]
      );
    }
    if (!coverImage) {
      setCoverImage(imageUrl);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (uploadedImages.length === 1) {
      setImageUploadError('Мінімум одне фото необхідне. Не можна видалити останнє фото.');
      return;
    }

    setImageUploadError(null);
    setUploadedImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const removed = prev[index];
      if (removed && removed === coverImage) {
        setCoverImage(next[0] ?? '');
      }
      return next;
    });
    setUploadedImageKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetCover = (imageUrl: string) => {
    setUploadedImages((prev) => {
      const index = prev.indexOf(imageUrl);
      if (index <= 0) return prev;
      const next = [prev[index], ...prev.filter((_, i) => i !== index)];
      setUploadedImageKeys((keysPrev) => {
        if (keysPrev.length !== prev.length) return keysPrev;
        return [keysPrev[index], ...keysPrev.filter((_, i) => i !== index)];
      });
      return next;
    });
    setCoverImage(imageUrl);
  };

  const handleIdentifyUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setAiError(null);
    setAiLoading(true);
    setAiResult(null);
    setAiResultApplied(false);
    setIdentifySuggestions([]);
    setAiSource('photo');

    try {
      const { base64, dataUrl } = await readImageData(files[0]);
      setIdentifyPreviewUrl(dataUrl);
      const imageBase64 = base64.trim();
      if (!imageBase64) {
        setAiError('Не вдалося зчитати зображення для розпізнавання.');
        return;
      }
      const response = await plantIdentifyService.identify({
        imageBase64,
        images: [imageBase64],
      });

      const { result, suggestions } = resolveIdentifyResult(response);
      setIdentifySuggestions(suggestions);

      if (!result) {
        setAiError('Не вдалося розпізнати рослину за фото.');
        return;
      }

      setAiResult(result);
    } catch (err) {
      if (err instanceof Error && err.message) {
        setAiError(err.message);
      } else {
        setAiError(getNetworkErrorMessage(err));
      }
    } finally {
      setAiLoading(false);
    }
  };

  const toggleTag = (tag: AdditionalTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const getPlantNameError = (): string | null => {
    if (fieldErrors.plantName) return fieldErrors.plantName;
    if (plantName.length === 0) return null;
    const validation = validatePlantName(plantName);
    return validation.valid ? null : validation.error || null;
  };

  const getCityError = (): string | null => {
    if (fieldErrors.city) return fieldErrors.city;
    if (city.length === 0) return null;
    const validation = validateCity(city);
    return validation.valid ? null : validation.error || null;
  };

  const getDistrictError = (): string | null => {
    return fieldErrors.district ?? null;
  };

  const getDescriptionError = (): string | null => {
    if (description.length === 0) return null;
    const validation = validateDescription(description);
    return validation.valid ? null : validation.error || null;
  };

  const handleSubmitListing = async () => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setFieldErrors({});

    const validationResult = validateCreateListing({
      plantName,
      category,
      size,
      condition,
      careLevel,
      city,
      wateringFreq,
      lightReqs,
      uploadedImages,
      description,
      listingType,
      aiResultApplied,
      humidity,
      toxicity,
      growthRate,
      selectedTags,
    });

    if (!validationResult.valid) {
      setSubmitError(validationResult.error || 'Сталася помилка валідації.');
      return;
    }

    const resolvedGenus =
      aiResult?.genus ??
      (aiResult?.scientificName ? aiResult.scientificName.split(' ')[0] : undefined) ??
      (aiResult?.plantName ? aiResult.plantName.split(' ')[0] : undefined);
    const resolvedCommonName =
      aiResult?.commonName ?? aiResult?.scientificName ?? aiResult?.plantName;
    const resolvedFamily = aiResult?.family ?? '—';

    if (!resolvedGenus || !resolvedCommonName) {
      setSubmitError('Спочатку визначте рослину, щоб отримати рід та назву.');
      return;
    }

    try {
      setSubmitLoading(true);
      
      let currentUserName: string | undefined;
      try {
        const currentUser = await authService.me();
        currentUserName = currentUser.name || currentUser.fullName;
      } catch {
        currentUserName = undefined;
      }
      
      const coverIndex = coverImage ? uploadedImages.indexOf(coverImage) : -1;
      const coverKey =
        coverIndex >= 0 ? uploadedImageKeys[coverIndex] : uploadedImageKeys[0];
      
      const normalizedCity = normalizeCity(city);
      const normalizedDistrict = district.trim() ? normalizeCity(district) : undefined;
      
      const sanitizedPlantName = sanitizeInput(plantName.trim());
      const sanitizedDescription = sanitizeInput(description.trim()) || undefined;
      
      const response = await announcementService.create({
        plantName: sanitizedPlantName,
        offerType: listingType === 'offer' ? 'offer' : 'looking-for',
        category: category!,
        size: size!,
        condition: condition!,
        careLevel: careLevel!,
        city: normalizedCity,
        genus: resolvedGenus,
        family: resolvedFamily,
        commonName: resolvedCommonName,
        description: sanitizedDescription,
        additionalTags: selectedTags.length ? selectedTags : undefined,
        district: normalizedDistrict,
        pestFree,
        readyToExchange,
        imageUrl: coverImage || uploadedImages[0],
        images: uploadedImages.length ? uploadedImages : undefined,
        photoUrl: coverImage || uploadedImages[0],
        photoKey: coverKey,
        wateringFreq: wateringFreq!,
        lightReqs: lightReqs!,
        humidity: humidity || undefined,
        toxicity: toxicity || undefined,
        growthRate: growthRate || undefined,
        hasOffspring,
        userName: currentUserName,
      });

      if (response.success) {
        setSubmitSuccess('Оголошення створено успішно.');
        setShowSubmitModal(true);
      } else {
        setSubmitError('Не вдалося створити оголошення.');
      }
    } catch (err) {
      if (err instanceof AnnouncementServiceError) {
        const serverFieldErrors = mapServerFieldErrors(err.issues, createFieldNames);
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverFieldErrors }));
          setSubmitError(null);
          return;
        }
      }

      if (err instanceof Error && err.message) {
        setSubmitError(err.message);
      } else {
        setSubmitError(getNetworkErrorMessage(err));
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-slate-900">
      {showSubmitModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Успіх
              </p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">
                Оголошення створено
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Дані оголошення збережено. Оберіть, що робити далі.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={() => navigate('/my-announcements')}
                className="h-11 rounded-xl from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
              >
                Перейти до моїх оголошень
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setShowSubmitModal(false);
                  resetListingForm();
                }}
                className="h-11 rounded-xl bg-white text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50"
              >
                Створити ще одне оголошення
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-stretch">
        <section className="h-full rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-950">Тип оголошення</h2>
            <p className="text-sm text-slate-600">Оберіть сценарій взаємодії</p>
          </div>

          <div className="mt-4 flex flex-1 items-end">
            <div className="flex w-full flex-col rounded-2xl border border-gray-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setListingType('offer')}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all',
                listingType === 'offer'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-green-700'
              )}
            >
              <Leaf className={cn('h-4 w-4', listingType === 'offer' ? 'text-white' : 'text-green-600')} />
              Пропоную
            </button>

            <button
              type="button"
              onClick={() => setListingType('search')}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all',
                listingType === 'search'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-green-700'
              )}
            >
              <Search className={cn('h-4 w-4', listingType === 'search' ? 'text-white' : 'text-green-600')} />
              Шукаю
            </button>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-green-200 bg-green-50 p-5 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] shadow-sm">
              <Scan className="h-5 w-5 text-white" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-950">
                Визначення рослини
              </h2>
              <p className="text-sm text-slate-600">
                AI допомагає визначати рослину за фото та назвою 
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-3">
              <Label htmlFor="plant-name" className="!text-[14px] font-semibold text-slate-900">
                Назва рослини
              </Label>
              <div className="space-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    id="plant-name"
                    value={plantName}
                    onChange={(e) => {
                      setNoDigitsFieldValue(
                        'plantName',
                        e.target.value,
                        setPlantName,
                        VALIDATION_LIMITS.plantName.max
                      );
                    }}
                    placeholder="Наприклад: Монстера Делікатесна"
                    maxLength={VALIDATION_LIMITS.plantName.max}
                    className={`h-11 min-w-0 flex-1 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getPlantNameError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
                    {plantName.length}/{VALIDATION_LIMITS.plantName.max}
                  </span>
                </div>
                {getPlantNameError() && (
                  <p className="text-xs text-red-600">{getPlantNameError()}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[0.8fr_0.8fr_1.4fr]">
              <Button
                type="button"
                onClick={() => aiUploadRef.current?.click()}
                className="h-11 rounded-xl from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
              >
                <Scan className="mr-2 h-4 w-4" />
                Сканувати рослину
              </Button>

              <Button
                type="button"
                onClick={() => aiUploadRef.current?.click()}
                className="h-11 rounded-xl from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
              >
                <Upload className="mr-2 h-4 w-4" />
                Завантажити фото
              </Button>

              <Button
                type="button"
                onClick={handleNameRecognition}
                className="h-11 rounded-xl bg-white text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50"
                disabled={aiLoading}
              >
                <Search className="mr-2 h-4 w-4" />
                {aiLoading ? 'Пошук...' : 'Знайти за назвою'}
              </Button>

              <input
                ref={aiUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleIdentifyUpload(e.target.files)}
              />
            </div>

            {aiError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {aiError}
              </div>
            ) : null}

            {aiResult ? (
              <div className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Результат визначення
                    </p>
                    <h3 className="text-clamp-1 text-xl font-bold text-slate-950">
                      {aiResult.plantName}
                    </h3>
                    {aiResult.commonName ? (
                      <p className="text-clamp-1 text-sm text-slate-600">
                        Загальна назва: {aiResult.commonName}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleClearAiResult}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex w-full flex-col gap-3 sm:w-[220px] sm:flex-shrink-0">
                    {aiResult.referenceImageUrl || (aiSource === 'photo' && identifyPreviewUrl) ? (
                      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                        <img
                          src={aiResult.referenceImageUrl ?? identifyPreviewUrl ?? ''}
                          alt={aiResult.plantName}
                          className="h-48 w-full object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-slate-50 text-sm text-slate-500">
                        Фото відсутнє
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    {aiSource === 'photo' ? (
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Точність
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#4caf50]"
                              style={{ width: `${aiResult.confidence}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-green-700">
                            {aiResult.confidence}%
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{confidenceLabel}</p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Наукова назва
                      </p>
                      <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                        {aiResult.scientificName ?? '—'}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Рід
                      </p>
                      <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                        {aiResult.genus ?? '—'}
                      </p>
                    </div>


                  </div>
                </div>

                {aiSource === 'name' && nameSuggestions.length > 0 ? (
                  <div className="mt-5 rounded-2xl border border-green-100 bg-green-50/60 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Схожі варіанти
                    </p>
                    <div className="space-y-2">
                      {nameSuggestions.map((item, index) => (
                        <button
                          key={`${item.plantName}-${index}`}
                          type="button"
                          onClick={() => handlePickNameSuggestion(item)}
                          className="flex min-w-0 w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-green-200 hover:bg-green-50"
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.plantName}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">
                              —
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-clamp-1 font-semibold text-slate-900">
                              {item.plantName}
                            </div>
                            <div className="text-clamp-1 text-xs text-slate-500">
                              {item.genus ? `Рід: ${item.genus}` : 'Рід: —'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {identifySuggestions.length > 0 ? (
                  <div className="mt-5 rounded-2xl border border-green-100 bg-green-50/60 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Варіанти визначення
                    </p>
                    <div className="space-y-2">
                      {identifySuggestions.map((item, index) => (
                        <button
                          key={`${item.name}-${index}`}
                          type="button"
                          onClick={() => handlePickIdentifySuggestion(item)}
                          className="flex min-w-0 w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-green-200 hover:bg-green-50"
                        >
                          <span className="min-w-0 flex-1 text-clamp-1 font-semibold text-slate-900">{item.name}</span>
                          <div className="flex shrink-0 items-center gap-3">
                            {typeof item.probability === 'number' ? (
                              <span className="text-sm font-semibold text-green-700">
                                {normalizeConfidence(item.probability)}%
                              </span>
                            ) : null}
                            {item.url ? (
                              <span className="text-xs font-semibold text-green-700">
                                Деталі
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm leading-6 text-slate-600">
                  Ці значення підтягуються автоматично. Параметри оголошення користувач
                  заповнює вручну.
                </div>

                {aiResultApplied ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Дані з результату будуть використані для створення оголошення.
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handleUseAIResult}
                  className="mt-4 h-11 w-full rounded-xl from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Використати результат
                </Button>
              </div>
            ) : null}
          </div>
        </section>
        </div>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">
              Характеристики рослини
            </h2>
          </div>

          <div className="space-y-7">
            <OptionGroup
              label="Категорія *"
              options={categoryOptions}
              value={category}
              onChange={(next) => setCategory(next)}
            />

            <OptionGroup
              label="Розмір *"
              options={sizeOptions}
              value={size}
              onChange={(next) => setSize(next)}
            />

            <OptionGroup
              label="Стан *"
              options={conditionOptions}
              value={condition}
              onChange={(next) => setCondition(next)}
            />

            <OptionGroup
              label="Рівень догляду *"
              options={careLevelOptions}
              value={careLevel}
              onChange={(next) => setCareLevel(next)}
            />

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="!text-[14px] font-semibold text-slate-900">
                  Додаткові характеристики
                </Label>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {additionalTags.map((tag) => {
                  const active = selectedTags.includes(tag);

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'max-w-full min-w-[110px] rounded-xl border px-4 py-2 text-center text-sm font-semibold leading-5 whitespace-normal break-words transition-all',
                        active
                          ? 'border-transparent bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)]'
                          : 'border-gray-300 bg-white text-slate-600 hover:border-green-500 hover:bg-green-50 hover:text-green-700'
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">
              Умови вирощування
            </h2>
          </div>

          <div className="space-y-6">
            <OptionGroup
              label="Частота поливу *"
              options={wateringFreqOptions}
              value={wateringFreq}
              onChange={(next) => setWateringFreq(next as WateringFreq)}
            />

            <OptionGroup
              label="Вимоги до світла *"
              options={lightReqsOptions}
              value={lightReqs}
              onChange={(next) => setLightReqs(next as LightReqs)}
            />

            <OptionGroup
              label="Вологість повітря"
              options={humidityOptions}
              value={humidity}
              onChange={(next) => setHumidity(next as Humidity | null)}
            />

            <OptionGroup
              label="Отруйність"
              options={toxicityOptions}
              value={toxicity}
              onChange={(next) => setToxicity(next as Toxicity | null)}
            />

            <OptionGroup
              label="Швидкість росту"
              options={growthRateOptions}
              value={growthRate}
              onChange={(next) => setGrowthRate(next as GrowthRate | null)}
            />

          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">
              Додаткова інформація
            </h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                <Label className="!text-[14px] font-semibold text-slate-900">Локація *</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Input
                    value={city}
                    onChange={(e) => {
                      setNoDigitsFieldValue('city', e.target.value, setCity, VALIDATION_LIMITS.city.max);
                    }}
                    placeholder="Місто"
                    maxLength={VALIDATION_LIMITS.city.max}
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getCityError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  <div className="flex justify-between">
                    <div className="text-xs text-slate-500">{city.length}/{VALIDATION_LIMITS.city.max}</div>
                    {getCityError() && (
                      <p className="text-xs text-red-600">{getCityError()}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Input
                    value={district}
                    onChange={(e) => {
                      setNoDigitsFieldValue(
                        'district',
                        e.target.value,
                        setDistrict,
                        VALIDATION_LIMITS.district.max
                      );
                    }}
                    placeholder="Район (опціонально)"
                    maxLength={VALIDATION_LIMITS.district.max}
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getDistrictError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  <div className="flex justify-between">
                    <div className="text-xs text-slate-500">{district.length}/{VALIDATION_LIMITS.district.max}</div>
                    {getDistrictError() && (
                      <p className="text-xs text-red-600">{getDistrictError()}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="!text-[14px] font-semibold text-slate-900">Опис</Label>
              <div className="space-y-2">
                <Textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, VALIDATION_LIMITS.description.max));
                    setSubmitError(null);
                  }}
                  placeholder="Опишіть стан рослини, умови догляду або побажання до обміну"
                  maxLength={VALIDATION_LIMITS.description.max}
                  className={`min-h-[120px] rounded-xl bg-white px-4 py-3 text-sm transition-colors ${
                    getDescriptionError()
                      ? 'border-2 border-red-500 focus:border-red-500'
                      : 'border-gray-300 focus:border-green-500'
                  }`}
                />
                <div className="flex justify-between">
                  <div className="flex gap-2">
                    {getDescriptionError() && (
                      <span className="text-xs text-red-600">{getDescriptionError()}</span>
                    )}
                    <span className="text-xs text-slate-500">{description.length}/{VALIDATION_LIMITS.description.max}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="!text-[14px] font-semibold text-slate-900">Фотографії</Label>

              <div className="rounded-[24px] border border-green-200 bg-green-50 px-6 py-6">
                <UploadImage
                  onUpload={(url: string, key: string) => handleImageUpload(url, key)}
                  showPreview={false}
                />
              </div>

              {imageUploadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                  {imageUploadError}
                </div>
              ) : null}

              {uploadedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
                  {uploadedImages.slice(0, MAX_IMAGES).map((image, index) => {
                    const isCover = image === coverImage;
                    return (
                      <div
                        key={`${image}-${index}`}
                        className="relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-slate-50"
                      >
                        <img
                          src={image}
                          alt={`Завантажене фото ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {isCover ? (
                          <span className="absolute left-2 top-2 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                            Обкладинка
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetCover(image)}
                            className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                          >
                            Зробити обкладинкою
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-sm transition hover:bg-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">Додаткові опції</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <Checkbox
                checked={pestFree}
                onCheckedChange={(checked) => setPestFree(Boolean(checked))}
                className="border-slate-400"
              />
              Рослина без шкідників
            </label>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <Checkbox
                checked={readyToExchange}
                onCheckedChange={(checked) => setReadyToExchange(Boolean(checked))}
                className="border-slate-400"
              />
              Готовий/готова до обміну найближчим часом
            </label>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <Checkbox
                checked={hasOffspring}
                onCheckedChange={(checked) => setHasOffspring(Boolean(checked))}
                className="border-slate-400"
              />
              Має дітей/можна розділити
            </label>

          </div>
        </section>

        {submitError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {submitError}
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {submitSuccess}
          </div>
        ) : null}

        <section className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl border-green-700 text-green-700 hover:border-green-600 hover:bg-green-50 hover:text-green-700"
          >
            Скасувати
          </Button>

          <Button
            className="h-11 flex-1 rounded-xl from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
            onClick={handleSubmitListing}
            disabled={submitLoading}
          >
            {submitLoading ? 'Створення...' : 'Створити оголошення'}
          </Button>
        </section>
      </main>
    </div>
  );
}
