import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, Leaf, MapPin, Search, X } from 'lucide-react';

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
import AppHeader from '../components/AppHeader';
import OptionGroup from '../components/OptionGroup';
import UploadImage from '../components/UploadImage';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  buildDigitErrorMessages,
  mapServerFieldErrors,
  setNoDigitsFieldValue as applyNoDigitsFieldValue,
} from '../utils/announcementForm';
import { validateEditListing, normalizeCity, VALIDATION_LIMITS, validatePlantName, validateCity, validateDescription, sanitizeInput } from '../utils/validation';
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
  { value: 'partial' as const, label: 'Частково тінь' },
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
  { value: 'slow' as const, label: 'Повільна' },
  { value: 'moderate' as const, label: 'Помірна' },
  { value: 'fast' as const, label: 'Швидка' },
] as const;

const additionalTags: AdditionalTag[] = [
  'Квітуча',
  'Швидкозростаюча',
  'Повітроочищувальна',
  'Рідкісна',
  'Для новачків',
];

const MAX_IMAGES = 5;
const editFieldLabels = {
  plantName: 'Назва рослини',
  commonName: 'Загальна назва',
  genus: 'Рід',
  family: 'Родина',
  city: 'Місто',
  district: 'Район',
} as const;
type EditFieldErrorKey = keyof typeof editFieldLabels;
const editFieldNames = Object.keys(editFieldLabels) as EditFieldErrorKey[];
const digitErrorMessages = buildDigitErrorMessages(editFieldLabels);

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const pickString = (...values: Array<unknown>): string | undefined =>
  values.find((value): value is string => typeof value === 'string' && value.trim() !== '');


export default function EditAnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditFieldErrorKey, string>>>({});
  const [listingType, setListingType] = useState<ListingType>('offer');
  const [plantName, setPlantName] = useState('');
  const [commonName, setCommonName] = useState('');
  const [genus, setGenus] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState<PlantCategory>(null);
  const [size, setSize] = useState<PlantSize>(null);
  const [condition, setCondition] = useState<PlantCondition>(null);
  const [careLevel, setCareLevel] = useState<CareLevel>(null);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AdditionalTag[]>([]);
  const [pestFree, setPestFree] = useState(false);
  const [readyToExchange, setReadyToExchange] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string>('');
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [wateringFreq, setWateringFreq] = useState<WateringFreqType>(null);
  const [lightReqs, setLightReqs] = useState<LightReqsType>(null);
  const [humidity, setHumidity] = useState<HumidityType>(null);
  const [toxicity, setToxicity] = useState<ToxicityType>(null);
  const [growthRate, setGrowthRate] = useState<GrowthRateType>(null);
  const [hasOffspring, setHasOffspring] = useState(false);
  
  const [originalData, setOriginalData] = useState<Record<string, unknown> | null>(null);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);

  const setNoDigitsFieldValue = (
    field: EditFieldErrorKey,
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

  const hasChanges = useMemo(() => {
    if (!originalData) return false;

    const currentData = {
      listingType,
      plantName,
      category,
      size,
      condition,
      careLevel,
      city,
      district,
      description,
      selectedTags,
      pestFree,
      readyToExchange,
      imagePreviews,
      wateringFreq,
      lightReqs,
      humidity,
      toxicity,
      growthRate,
      hasOffspring,
    };

    return JSON.stringify(currentData) !== JSON.stringify(originalData);
  }, [
    originalData,
    listingType,
    plantName,
    category,
    size,
    condition,
    careLevel,
    city,
    district,
    description,
    selectedTags,
    pestFree,
    readyToExchange,
    imagePreviews,
    wateringFreq,
    lightReqs,
    humidity,
    toxicity,
    growthRate,
    hasOffspring,
  ]);

  const tagsSet = useMemo(() => new Set(additionalTags), []);

  const applyRecord = (record: Record<string, unknown>) => {
    setFieldErrors({});
    const rawOfferType = pickString(
      record.offerType,
      record.offer_type,
      record.type,
      record.listingType
    );
    const resolvedListingType =
      rawOfferType === 'offer' || rawOfferType === 'offering' ? 'offer' : 'search';

    setOriginalData({
      listingType: (resolvedListingType as any),
      plantName: pickString(record.plantName, record.plant_name, record.title, record.name) ?? '',
      category: (pickString(record.category) as PlantCategory) ?? null,
      size: (pickString(record.size) as PlantSize) ?? null,
      condition: (pickString(record.condition) as PlantCondition) ?? null,
      careLevel: (pickString(record.careLevel, record.care_level) as CareLevel) ?? null,
      city: pickString(record.city) ?? '',
      district: pickString(record.district) ?? '',
      description: pickString(record.description) ?? '',
      selectedTags: (() => {
        const rawTags = (record.additionalTags as string[] | undefined) ?? (record.tags as string[] | undefined) ?? [];
        return rawTags.filter((tag) => tagsSet.has(tag as AdditionalTag)) as AdditionalTag[];
      })(),
      pestFree: Boolean(record.pestFree ?? record.pest_free),
      readyToExchange: Boolean(record.readyToExchange ?? record.ready_to_exchange),
      imagePreviews: (() => {
        const images = (record.images as string[] | undefined) ?? (record.photos as string[] | undefined) ?? (record.photoUrls as string[] | undefined) ?? [];
        const firstImage = pickString(record.imageUrl, record.image, record.photoUrl, record.primaryImage, record.coverImage);
        const mergedImages = [firstImage, ...images].filter((value): value is string => Boolean(value && value.trim())).filter((value, index, self) => self.indexOf(value) === index);
        return mergedImages.slice(0, 5);
      })(),
      wateringFreq: (pickString(record.wateringFreq, record.watering_freq) as WateringFreqType) ?? null,
      lightReqs: (pickString(record.lightReqs, record.light_reqs) as LightReqsType) ?? null,
      humidity: (pickString(record.humidity) as HumidityType) ?? null,
      toxicity: (pickString(record.toxicity) as ToxicityType) ?? null,
      growthRate: (pickString(record.growthRate, record.growth_rate) as GrowthRateType) ?? null,
      hasOffspring: Boolean(record.hasOffspring ?? record.has_offspring),
    });

    setListingType(resolvedListingType);
    setPlantName(pickString(record.plantName, record.plant_name, record.title, record.name) ?? '');
    setCommonName(pickString(record.commonName, record.common_name, record.common_name_uk) ?? '');
    setGenus(pickString(record.genus, record.genus_uk) ?? '');
    setFamily(pickString(record.family, record.family_uk) ?? '');
    setCategory((pickString(record.category) as PlantCategory) ?? null);
    setSize((pickString(record.size) as PlantSize) ?? null);
    setCondition((pickString(record.condition) as PlantCondition) ?? null);
    setCareLevel((pickString(record.careLevel, record.care_level) as CareLevel) ?? null);
    setCity(pickString(record.city) ?? '');
    setDistrict(pickString(record.district) ?? '');
    setDescription(pickString(record.description) ?? '');

    const rawTags = (record.additionalTags as string[] | undefined) ?? (record.tags as string[] | undefined) ?? [];
    const matchedTags = rawTags.filter((tag) => tagsSet.has(tag as AdditionalTag));
    setSelectedTags(matchedTags as AdditionalTag[]);

    setPestFree(Boolean(record.pestFree ?? record.pest_free));
    setReadyToExchange(Boolean(record.readyToExchange ?? record.ready_to_exchange));

    const images = (record.images as string[] | undefined) ?? (record.photos as string[] | undefined) ?? (record.photoUrls as string[] | undefined) ?? [];
    const firstImage = pickString(record.imageUrl, record.image, record.photoUrl, record.primaryImage, record.coverImage);
    const mergedImages = [firstImage, ...images].filter((value): value is string => Boolean(value && value.trim())).filter((value, index, self) => self.indexOf(value) === index);
    const limitedImages = mergedImages.slice(0, MAX_IMAGES);
    setImagePreviews(limitedImages);
    setImageKeys([]);
    setCoverImage(limitedImages[0] ?? '');
    setImageUploadError(null);

    setWateringFreq((pickString(record.wateringFreq, record.watering_freq) as WateringFreqType) ?? null);
    setLightReqs((pickString(record.lightReqs, record.light_reqs) as LightReqsType) ?? null);
    setHumidity((pickString(record.humidity) as HumidityType) ?? null);
    setToxicity((pickString(record.toxicity) as ToxicityType) ?? null);
    setGrowthRate((pickString(record.growthRate, record.growth_rate) as GrowthRateType) ?? null);
    setHasOffspring(Boolean(record.hasOffspring ?? record.has_offspring));
  };

  useEffect(() => {
    let isMounted = true;

    const stateRecord = (location.state as { listing?: Record<string, unknown> } | null)
      ?.listing;
    if (stateRecord && typeof stateRecord === 'object') {
      applyRecord(stateRecord);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const loadAnnouncement = async () => {
      if (!id) {
        setLoadError('Не вдалося знайти оголошення для редагування.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await announcementService.getById(id);
        const data =
          (response.announcement as Record<string, unknown> | undefined) ??
          (response.data as Record<string, unknown> | undefined) ??
          response;
        const record = Array.isArray(data) ? data[0] : data;

        if (!isMounted || !record || typeof record !== 'object') {
          setLoadError('Не вдалося отримати дані оголошення.');
          return;
        }

        const announcementUserId = pickString(
          (record.userId as string | undefined),
          (record.user_id as string | undefined),
          (record.createdBy as string | undefined),
          (record.created_by as string | undefined),
          (record.ownerId as string | undefined),
          (record.owner_id as string | undefined)
        );
        
        const currentUserId = authService.getUserId();

        if (announcementUserId && currentUserId && announcementUserId !== currentUserId) {
          setLoadError('Ви не можете редагувати оголошення іншого користувача.');
          if (isMounted) {
            setTimeout(() => navigate('/my-announcements', { replace: true }), 1500);
          }
          return;
        }

        applyRecord(record as Record<string, unknown>);
      } catch (error) {
        if (!isMounted) return;
        let message = 'Не вдалося отримати оголошення.';
        if (error instanceof Error && error.message) {
          message = error.message;
        } else {
          message = getNetworkErrorMessage(error);
        }
        setLoadError(message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAnnouncement();

    return () => {
      isMounted = false;
    };
  }, [id, location.state, tagsSet]);

  const toggleTag = (tag: AdditionalTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const handleImageUpload = (imageUrl: string, imageKey: string) => {
    setImageUploadError(null);
    if (imagePreviews.length >= MAX_IMAGES) {
      setImageUploadError(`Можна додати максимум ${MAX_IMAGES} фото.`);
      return;
    }
    setImagePreviews((prev) =>
      prev.includes(imageUrl) ? prev : [...prev, imageUrl]
    );
    if (imageKey) {
      setImageKeys((prev) =>
        prev.includes(imageKey) ? prev : [...prev, imageKey]
      );
    }
    if (!coverImage) {
      setCoverImage(imageUrl);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (imagePreviews.length === 1) {
      setImageUploadError('Мінімум одне фото необхідне. Не можна видалити останнє фото.');
      return;
    }

    setImageUploadError(null);
    setImagePreviews((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const removed = prev[index];
      if (removed && removed === coverImage) {
        setCoverImage(next[0] ?? '');
      }
      return next;
    });
    setImageKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetCover = (imageUrl: string) => {
    setImagePreviews((prev) => {
      const index = prev.indexOf(imageUrl);
      if (index <= 0) return prev;
      const next = [prev[index], ...prev.filter((_, i) => i !== index)];
      setImageKeys((keysPrev) => {
        if (keysPrev.length !== prev.length) return keysPrev;
        return [keysPrev[index], ...keysPrev.filter((_, i) => i !== index)];
      });
      return next;
    });
    setCoverImage(imageUrl);
  };

  const handleCancelEdit = () => {
    if (hasChanges) {
      setShowUnsavedChangesModal(true);
    } else {
      navigate('/my-announcements');
    }
  };

  const handleConfirmCancel = () => {
    setShowUnsavedChangesModal(false);
    navigate('/my-announcements');
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

  const getCommonNameError = (): string | null => fieldErrors.commonName ?? null;
  const getGenusError = (): string | null => fieldErrors.genus ?? null;
  const getFamilyError = (): string | null => fieldErrors.family ?? null;
  const getDistrictError = (): string | null => fieldErrors.district ?? null;

  const getDescriptionError = (): string | null => {
    if (description.length === 0) return null;
    const validation = validateDescription(description);
    return validation.valid ? null : validation.error || null;
  };

  const handleSubmit = async () => {
    if (!id) return;

    setSubmitError(null);
    setSubmitSuccess(null);
    setFieldErrors({});

    const currentUserId = authService.getUserId();
    if (originalData && typeof originalData === 'object') {
      const announcementUserId = (originalData as any).userId || (originalData as any).user_id || (originalData as any).createdBy || (originalData as any).created_by;
      if (announcementUserId && currentUserId && announcementUserId !== currentUserId) {
        setSubmitError('Ви не можете редагувати оголошення іншого користувача.');
        return;
      }
    }

    const validationResult = validateEditListing({
      plantName,
      category,
      size,
      condition,
      careLevel,
      city,
      wateringFreq,
      lightReqs,
      imagePreviews,
      description,
      listingType,
      humidity,
      toxicity,
      growthRate,
      selectedTags,
    });

    if (!validationResult.valid) {
      setSubmitError(validationResult.error || 'Сталася помилка валідації.');
      return;
    }

    const resolvedGenus = genus.trim() || plantName.trim().split(' ')[0] || '—';
    const resolvedCommonName = commonName.trim() || plantName.trim();
    const resolvedFamily = family.trim() || '—';

    try {
      setSubmitLoading(true);
      
      let currentUserName: string | undefined;
      try {
        const currentUser = await authService.me();
        currentUserName = currentUser.name || currentUser.fullName;
      } catch {
        currentUserName = undefined;
      }
      
      const resolvedOfferType = listingType === 'offer' ? 'offer' : 'looking-for';
      const coverIndex = coverImage ? imagePreviews.indexOf(coverImage) : -1;
      const coverKey = coverIndex >= 0 ? imageKeys[coverIndex] : imageKeys[0];
      
      const normalizedCity = normalizeCity(city);
      const normalizedDistrict = district.trim() ? normalizeCity(district) : undefined;
      
      const sanitizedPlantName = sanitizeInput(plantName.trim());
      const sanitizedDescription = sanitizeInput(description.trim()) || undefined;
      
      const payload = {
        plantName: sanitizedPlantName,
        offerType: resolvedOfferType,
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
        images: imagePreviews.length ? imagePreviews : undefined,
        imageUrl: coverImage || imagePreviews[0],
        photoUrl: coverImage || imagePreviews[0],
        photoKey: coverKey,
        wateringFreq: wateringFreq!,
        lightReqs: lightReqs!,
        humidity: humidity || undefined,
        toxicity: toxicity || undefined,
        growthRate: growthRate || undefined,
        hasOffspring,
        userName: currentUserName,
        offer_type: resolvedOfferType,
        care_level: careLevel,
        additional_tags: selectedTags.length ? selectedTags : undefined,
        ready_to_exchange: readyToExchange,
        pest_free: pestFree,
      } as Record<string, unknown>;

      await announcementService.update(id, payload);

      setSubmitSuccess('Оголошення оновлено успішно.');
      navigate('/my-announcements');
    } catch (error) {
      if (error instanceof AnnouncementServiceError) {
        const serverFieldErrors = mapServerFieldErrors(error.issues, editFieldNames);
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverFieldErrors }));
          setSubmitError(null);
          return;
        }
      }

      let message = 'Не вдалося оновити оголошення.';
      if (error instanceof Error && error.message) {
        message = error.message;
      } else {
        message = getNetworkErrorMessage(error);
      }
      setSubmitError(message);
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-slate-900">
        <AppHeader />
        <main className="app-layout w-full px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
            Завантажуємо дані оголошення...
          </div>
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-neutral-50 text-slate-900">
        <AppHeader />
        <main className="app-layout w-full px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-red-200 bg-white p-6 text-center text-sm text-red-600 shadow-sm">
            {loadError}
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              onClick={() => navigate('/my-announcements')}
              className="h-11 w-full rounded-xl bg-white px-6 text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50 sm:w-auto"
            >
              Повернутися до моїх оголошень
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-slate-900">
      {showUnsavedChangesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Скасувати редагування?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Ви впевнені, що хочете вийти? Незбережені зміни буде втрачено.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowUnsavedChangesModal(false)}
                className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
              >
                Продовжити редагування
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="h-11 flex-1 rounded-xl bg-red-100 text-sm font-semibold text-red-700 hover:bg-red-200"
              >
                Скасувати зміни
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-950">Тип оголошення</h2>
            <p className="text-sm text-slate-600">Оберіть сценарій взаємодії</p>
          </div>

          {submitSuccess ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {submitSuccess}
            </div>
          ) : null}

          {submitError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {submitError}
            </div>
          ) : null}

          <div className="mt-4 inline-flex rounded-2xl border border-gray-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setListingType('offer')}
              className={cn(
                'flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all',
                listingType === 'offer'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-green-700'
              )}
            >
              <Leaf
                className={cn(
                  'h-4 w-4',
                  listingType === 'offer' ? 'text-white' : 'text-green-600'
                )}
              />
              Пропоную
            </button>

            <button
              type="button"
              onClick={() => setListingType('search')}
              className={cn(
                'flex min-w-[140px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all',
                listingType === 'search'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-green-700'
              )}
            >
              <Search
                className={cn(
                  'h-4 w-4',
                  listingType === 'search' ? 'text-white' : 'text-green-600'
                )}
              />
              Шукаю
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">Назва, класифікація та фото</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="!text-[14px] font-semibold text-slate-900">
                  Назва рослини
                </Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={plantName}
                      onChange={(event) => {
                        setNoDigitsFieldValue(
                          'plantName',
                          event.target.value,
                          setPlantName,
                          VALIDATION_LIMITS.plantName.max
                        );
                      }}
                      placeholder="Наприклад, Монстера делікатесна"
                      maxLength={VALIDATION_LIMITS.plantName.max}
                      className={`h-11 flex-1 rounded-xl bg-white px-4 text-sm transition-colors ${
                        getPlantNameError()
                          ? 'border-2 border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-green-500'
                      }`}
                    />
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {plantName.length}/{VALIDATION_LIMITS.plantName.max}
                    </span>
                  </div>
                  {getPlantNameError() && (
                    <p className="text-xs text-red-600">{getPlantNameError()}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="!text-[14px] font-semibold text-slate-900">
                    Загальна назва
                  </Label>
                  <Input
                    value={commonName}
                    onChange={(event) => {
                      setNoDigitsFieldValue('commonName', event.target.value, setCommonName);
                    }}
                    placeholder="Наприклад, Монстера"
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getCommonNameError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  {getCommonNameError() && (
                    <p className="text-xs text-red-600">{getCommonNameError()}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="!text-[14px] font-semibold text-slate-900">Рід</Label>
                  <Input
                    value={genus}
                    onChange={(event) => {
                      setNoDigitsFieldValue('genus', event.target.value, setGenus);
                    }}
                    placeholder="Наприклад, Monstera"
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getGenusError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  {getGenusError() && (
                    <p className="text-xs text-red-600">{getGenusError()}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="!text-[14px] font-semibold text-slate-900">Родина</Label>
                <Input
                  value={family}
                  onChange={(event) => {
                    setNoDigitsFieldValue('family', event.target.value, setFamily);
                  }}
                  placeholder="Наприклад, Araceae"
                  className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                    getFamilyError()
                      ? 'border-2 border-red-500 focus:border-red-500'
                      : 'border-gray-300 focus:border-green-500'
                  }`}
                />
                {getFamilyError() && (
                  <p className="text-xs text-red-600">{getFamilyError()}</p>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-dashed border-gray-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
              </div>

              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-4">
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

              {imagePreviews.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {imagePreviews.slice(0, MAX_IMAGES).map((preview, index) => {
                    const isCover = preview === coverImage;
                    return (
                      <div
                        key={`${preview}-${index}`}
                        className="relative h-40 w-full overflow-hidden rounded-2xl border border-gray-200 bg-slate-50"
                      >
                        <img
                          src={preview}
                          alt={`Фото оголошення ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {isCover ? (
                          <span className="absolute left-2 top-2 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                            Обкладинка
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetCover(preview)}
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
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-slate-500">
                  <ImagePlus className="mb-2 h-8 w-8 text-slate-300" />
                  Фото ще не додані
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-6 space-y-1">
            <h2 className="text-xl font-bold text-slate-950">Характеристики рослини</h2>
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
                        'min-w-[126px] rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
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
            <h2 className="text-xl font-bold text-slate-950">Додаткова інформація</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                <Label className="!text-[14px] font-semibold text-slate-900">Локація</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">* ({city.length}/{VALIDATION_LIMITS.city.max})</Label>
                  <Input
                    value={city}
                    onChange={(event) => {
                      setNoDigitsFieldValue('city', event.target.value, setCity, VALIDATION_LIMITS.city.max);
                    }}
                    placeholder="Місто"
                    maxLength={VALIDATION_LIMITS.city.max}
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getCityError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  {getCityError() && (
                    <p className="text-xs text-red-600">{getCityError()}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Опціонально ({district.length}/{VALIDATION_LIMITS.district.max})</Label>
                  <Input
                    value={district}
                    onChange={(event) => {
                      setNoDigitsFieldValue(
                        'district',
                        event.target.value,
                        setDistrict,
                        VALIDATION_LIMITS.district.max
                      );
                    }}
                    placeholder="Район"
                    maxLength={VALIDATION_LIMITS.district.max}
                    className={`h-11 rounded-xl bg-white px-4 text-sm transition-colors ${
                      getDistrictError()
                        ? 'border-2 border-red-500 focus:border-red-500'
                        : 'border-gray-300 focus:border-green-500'
                    }`}
                  />
                  {getDistrictError() && (
                    <p className="text-xs text-red-600">{getDistrictError()}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="!text-[14px] font-semibold text-slate-900">Опис</Label>
              <div className="space-y-2">
                <Textarea
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value.slice(0, VALIDATION_LIMITS.description.max));
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
                <div className="flex justify-between text-xs">
                  {getDescriptionError() && (
                    <span className="text-red-600">{getDescriptionError()}</span>
                  )}
                  <span className={`ml-auto ${getDescriptionError() ? 'text-red-600' : 'text-slate-500'}`}>
                    {description.length}/{VALIDATION_LIMITS.description.max}
                  </span>
                </div>
              </div>
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
              label="Частота поливу * (обов'язково)"
              options={wateringFreqOptions}
              value={wateringFreq}
              onChange={(next) => setWateringFreq(next as WateringFreq)}
            />

            <OptionGroup
              label="Вимоги до світла * (обов'язково)"
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

            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <Checkbox
                  checked={hasOffspring}
                  onCheckedChange={(checked) => setHasOffspring(Boolean(checked))}
                  className="border-slate-400"
                />
                Має дітей / можна розділити
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Готові зберегти зміни?</p>
              <p className="text-sm text-slate-600">
                Оновлені дані будуть відображені у ваших оголошеннях
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                className="h-11 w-full min-w-[200px] rounded-xl px-6 text-sm font-semibold shadow-none sm:w-auto"
              >
                Скасувати
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitLoading}
                className="h-11 w-full min-w-[220px] rounded-xl px-6 from-[#2e7d32] to-[#49b04d] shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95 sm:w-auto"
              >
                {submitLoading ? 'Збереження...' : 'Зберегти зміни'}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

