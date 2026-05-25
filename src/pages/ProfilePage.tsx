import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Star, User } from 'lucide-react';

import AppHeader from '../components/AppHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import UploadImage from '../components/UploadImage';
import { authService } from '../api/authService';
import { profileService, type Profile } from '../api/profileService';
import { formatDate } from '../utils/date';
import { getNetworkErrorMessage } from '../utils/networkError';
import { useRatingsCache } from '../hooks/useRatingsCache';
import { formatRatingLine } from '../utils/ratingsFormat';

const trustLevelLabel = (level?: string, score?: number): string => {
  if (level) {
    const normalized = level.toLowerCase();
    if (normalized === 'high') return 'Високий рівень довіри';
    if (normalized === 'sufficient') return 'Достатній рівень довіри';
    if (normalized === 'basic') return 'Базовий рівень довіри';
    if (normalized === 'low') return 'Низький рівень довіри';
    return level;
  }
  if (typeof score === 'number') {
    if (score >= 80) return 'Високий рівень довіри';
    if (score >= 50) return 'Середній рівень довіри';
    return 'Низький рівень довіри';
  }
  return 'Рівень довіри не визначено';
};


export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTrustInfo, setShowTrustInfo] = useState(false);
  const trustInfoRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    bio: '',
    avatar: '',
  });

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const data = await profileService.getMe();
        if (!isMounted) return;
        setProfile(data);
        setFormData({
          name: data.name ?? '',
          city: data.city ?? '',
          bio: data.bio ?? '',
          avatar: data.avatar ?? data.avatarUrl ?? '',
        });
        authService.setUserProfile({
          id: data.id,
          name: data.name,
          email: data.email,
          avatar: data.avatar ?? data.avatarUrl,
          city: data.city,
          bio: data.bio,
          emailVerified: data.emailVerified ?? data.isEmailVerified,
          createdAt: data.createdAt,
        });
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : getNetworkErrorMessage(error);
        setLoadError(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!trustInfoRef.current) return;
      if (trustInfoRef.current.contains(event.target as Node)) return;
      setShowTrustInfo(false);
    };

    if (showTrustInfo) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showTrustInfo]);



  const trustScore = useMemo(() => {
    if (!profile) return undefined;
    return profile.trustScore;
  }, [profile]);

  const trustLabel = useMemo(
    () => trustLevelLabel(profile?.trustLevel, trustScore),
    [profile?.trustLevel, trustScore]
  );

  const profileCompleted = useMemo(() => {
    if (!profile) return false;
    return Boolean(profile.name && profile.city && profile.bio && (profile.avatar || profile.avatarUrl));
  }, [profile]);

  const isVerifiedProfile = Boolean(profile?.isProfileVerified);

  const isEmailVerified = Boolean(profile?.emailVerified || profile?.isEmailVerified);

  const hasActiveAnnouncements = useMemo(() => {
    if (!profile) return false;
    return (profile.activeAnnouncementsCount ?? 0) >= 1;
  }, [profile]);

  const isActive = useMemo(() => {
    if (!profile) return false;
    return (profile.activeAnnouncementsCount ?? 0) >= 1;
  }, [profile]);

  const isAccountMature = Boolean(profile?.isAccountOlderThan7Days);

  const badgeClass = (isDone: boolean) =>
    isDone
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-slate-200 text-slate-700';

  const handleEditToggle = () => {
    if (!profile) return;
    setSaveError(null);
    setSaveSuccess(null);
    setIsEditing((prev) => !prev);
    setFormData({
      name: profile.name ?? '',
      city: profile.city ?? '',
      bio: profile.bio ?? '',
      avatar: profile.avatar ?? profile.avatarUrl ?? '',
    });
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaveError(null);
    setSaveSuccess(null);

    const name = formData.name.trim();
    if (!name) {
      setSaveError('Вкажіть ім\'я, щоб зберегти профіль.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await profileService.update({
        name,
        city: formData.city.trim() || undefined,
        bio: formData.bio.trim() || undefined,
        avatar: formData.avatar.trim() || undefined,
      });
      setProfile(updated);
      setFormData({
        name: updated.name ?? '',
        city: updated.city ?? '',
        bio: updated.bio ?? '',
        avatar: updated.avatar ?? updated.avatarUrl ?? '',
      });
      authService.setUserProfile({
        id: updated.id,
        name: updated.name,
        email: updated.email,
        avatar: updated.avatar ?? updated.avatarUrl,
        city: updated.city,
        bio: updated.bio,
        emailVerified: updated.emailVerified ?? updated.isEmailVerified,
        createdAt: updated.createdAt,
      });
      setSaveSuccess('Профіль оновлено успішно.');
      setIsEditing(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
    } finally {
      authService.clearToken();
      navigate('/auth', { replace: true });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleteError(null);
      setIsDeleting(true);
      await profileService.remove();
      authService.clearToken();
      navigate('/auth', { replace: true });
    } catch (error) {
      setDeleteError('Не вдалося видалити акаунт. Спробуйте ще раз трохи пізніше.');
    } finally {
      setIsDeleting(false);
    }
  };

  const avatar = (profile?.avatar ?? profile?.avatarUrl)?.trim();
  const displayName = profile?.name || 'Користувач';
  const displayEmail = profile?.email || '—';
  const displayCity = profile?.city || 'Не вказано';
  const displayBio = profile?.bio || 'Додайте короткий опис про себе.';
  const activeCount = profile?.activeAnnouncementsCount ?? 0;
  const totalCount = profile?.totalAnnouncementsCount ?? 0;
  const displaySummary = profile?.ratingSummary;
  const averageRating = displaySummary?.averageRating ?? 0;
  const ratingsCount = displaySummary?.ratingsCount ?? 0;
  const completedExchangesCount = displaySummary?.completedExchangesCount ?? 0;
  const hasRatings = ratingsCount > 0;
  const latestReviews = displaySummary?.latestReviews ?? [];
  const commentedReviews = latestReviews.filter(
    (review) => typeof review.comment === 'string' && review.comment.trim() !== ''
  );
  const reviewAuthorIds = useMemo(
    () => commentedReviews.map((review) => review.fromUser?.id),
    [commentedReviews]
  );
  const { ratingsByUserId: reviewAuthorRatings } = useRatingsCache(reviewAuthorIds);
  const interactionsSummary = profile?.interactionsSummary;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="app-layout w-full px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="rounded-[24px] border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-slate-600">Завантажуємо профіль...</p>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Профіль</h2>
                  </div>
                  <Button variant="outline" onClick={handleEditToggle} className="h-11 rounded-xl px-6 min-w-[180px]">
                    {isEditing ? 'Скасувати' : 'Редагувати профіль'}
                  </Button>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[24px] bg-green-100">
                      {avatar ? (
                        <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-9 w-9 text-green-700" />
                      )}
                    </div>
                    <div className="flex h-28 min-w-0 flex-col justify-between">
                      <div>
                        <h1 className="text-clamp-1 text-xl font-bold text-slate-950">{displayName}</h1>
                        <p className="text-clamp-1 text-sm text-slate-600">{displayEmail}</p>
                        <p className="text-clamp-1 text-sm text-slate-500">{displayCity}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 text-left">
                    {profile.emailVerified || profile.isEmailVerified ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Пошта підтверджена
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        Пошта не підтверджена
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                      Реєстрація: {formatDate(profile.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex min-h-[148px] flex-col rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Довіра профілю
                      </p>
                      <div className="relative" ref={trustInfoRef}>
                        <button
                          type="button"
                          onClick={() => setShowTrustInfo((prev) => !prev)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-xs font-semibold text-slate-500 transition hover:border-green-300 hover:text-green-700"
                          aria-label="Як формується довіра профілю"
                        >
                          ?
                        </button>
                        {showTrustInfo ? (
                          <div className="absolute right-0 top-8 z-10 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                            <div className="flex items-start justify-between gap-3">
                              <p>
                                Показник формується на основі підтвердження пошти, заповненості профілю, активних оголошень та віку акаунта.
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowTrustInfo(false)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-slate-500 transition hover:bg-slate-200 hover:text-green-700"
                                aria-label="Закрити"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex-1">
                      <p className="text-2xl font-bold text-slate-900">
                        {trustScore ?? '—'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">{trustLabel}</p>
                  </div>

                  <div className="flex min-h-[148px] flex-col rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Рейтинг користувача
                    </p>
                    <div className="mt-2 flex-1">
                      {hasRatings ? (
                        <p className="text-2xl font-bold text-slate-900">
                          {averageRating.toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-2xl font-bold text-slate-900">—</p>
                      )}
                    </div>
                    {hasRatings ? (
                      <p className="text-xs text-slate-600">
                        {ratingsCount} оцінок · {completedExchangesCount} обмінів
                      </p>
                    ) : (
                      <p className="text-xs text-slate-600">Поки що немає оцінок</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">Про мене</h2>
                    <p className="mt-2 text-clamp-3 text-sm text-slate-600">{displayBio}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">Статистика</h2>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Активні оголошення</span>
                        <span className="font-semibold text-slate-900">
                            {activeCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Всього оголошень</span>
                        <span className="font-semibold text-slate-900">
                            {totalCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {saveError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {saveError}
                  </div>
                ) : null}

                {saveSuccess ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {saveSuccess}
                  </div>
                ) : null}

                {isEditing ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Ім'я</Label>
                      <Input
                        value={formData.name}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, name: event.target.value }))
                        }
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Місто</Label>
                      <Input
                        value={formData.city}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, city: event.target.value }))
                        }
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label>Аватар</Label>
                      <UploadImage
                        onUpload={(url) =>
                          setFormData((prev) => ({ ...prev, avatar: url }))
                        }
                        showPreview={false}
                      />
                      {formData.avatar ? (
                        <img
                          src={formData.avatar}
                          alt="Попередній перегляд аватара"
                          className="mt-3 h-20 w-20 rounded-2xl object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label>Біо</Label>
                      <Textarea
                        value={formData.bio}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, bio: event.target.value }))
                        }
                        className="min-h-[120px]"
                      />
                    </div>
                    <div className="lg:col-span-2 flex flex-wrap gap-3">
                      <Button onClick={handleSave} className="h-11 rounded-xl px-6 min-w-[180px]" disabled={isSaving}>
                        {isSaving ? 'Збереження...' : 'Зберегти зміни'}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl px-6 min-w-[180px]"
                        onClick={handleEditToggle}
                        disabled={isSaving}
                      >
                        Скасувати
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Довіра профілю</h2>
                  <p className="mt-1 text-sm text-slate-600">{trustLabel}</p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                  <ShieldCheck className="h-5 w-5 text-green-700" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-green-700">Показник довіри</p>
                    <p className="text-lg font-bold text-slate-900">{trustScore ?? '—'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2e7d32] to-[#49b04d]"
                    style={{ width: `${Math.min(Math.max(trustScore ?? 0, 0), 100)}%` }}
                  />
                </div>
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Порада: підвищуйте довіру через підтвердження пошти, завершення обмінів та регулярну активність.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isVerifiedProfile ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Профіль перевірений
                    </span>
                  ) : null}
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(isEmailVerified)}`}>
                    Пошту підтверджено
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(profileCompleted)}`}>
                    Профіль заповнений
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(hasActiveAnnouncements)}`}>
                    Є активні оголошення
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(isActive)}`}>
                    Активний користувач
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(isAccountMature)}`}>
                    Акаунт 7+ днів
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold text-slate-950">Рейтинг користувача</h2>
                  <p className="text-sm text-slate-600">Оцінки після завершених обмінів.</p>
              </div>

              {hasRatings ? (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Середній рейтинг</p>
                      <div className="mt-3 flex items-center gap-2 text-2xl font-bold text-slate-900">
                        <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
                        {averageRating.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Оцінок</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{ratingsCount}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Завершених обмінів</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{completedExchangesCount}</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-slate-900">Останні оцінки</h3>
                    {commentedReviews.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-600">Поки що немає оцінок.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {commentedReviews.map((review, index) => (
                          <div key={review.id ?? index} className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                            <Link
                              to={
                                review.fromUser?.id && review.fromUser.id !== profile?.id
                                  ? `/users/${review.fromUser.id}`
                                  : '#'
                              }
                              onClick={(event) => {
                                if (!review.fromUser?.id || review.fromUser.id === profile?.id) {
                                  event.preventDefault();
                                }
                              }}
                              className="-m-2 block rounded-xl p-2 transition hover:bg-green-50/60"
                            >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-green-100">
                                {review.fromUser?.avatar ? (
                                  <img src={review.fromUser.avatar} alt={review.fromUser.name} className="h-full w-full object-cover" />
                                ) : (
                                  <User className="h-5 w-5 text-green-700" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-clamp-1 text-sm font-semibold text-slate-900">
                                  {review.fromUser?.name || 'Користувач'}
                                </p>
                                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                                  <Star className="h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                                  <span className="min-w-0 text-clamp-1">
                                    {formatRatingLine({
                                      averageRating: review.fromUser?.id
                                        ? reviewAuthorRatings[review.fromUser.id]?.averageRating
                                        : undefined,
                                      ratingsCount: review.fromUser?.id
                                        ? reviewAuthorRatings[review.fromUser.id]?.ratingsCount
                                        : undefined,
                                      completedExchangesCount: review.fromUser?.id
                                        ? reviewAuthorRatings[review.fromUser.id]?.completedExchangesCount
                                        : undefined,
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            </Link>
                            {review.comment ? (
                              <p className="mt-3 text-clamp-3 text-sm text-slate-700">{review.comment}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-6 text-center">
                  <p className="text-sm text-slate-600">Поки що немає оцінок</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Рейтинг з’явиться після першого завершеного обміну.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Історія взаємодій</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Короткий підсумок усіх ваших обмінів. Детальніше — на сторінці обмінів.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl px-6 min-w-[180px]"
                  onClick={() => navigate('/exchanges')}
                >
                  Перейти до обмінів
                </Button>
              </div>

              {interactionsSummary ? (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Активні</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">
                        {interactionsSummary.activeCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Завершені</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">
                        {interactionsSummary.completedCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Скасовані</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">
                        {interactionsSummary.cancelledCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Всього</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">
                        {interactionsSummary.totalCount ?? 0}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-sm text-slate-600">
                    Остання взаємодія:{' '}
                    {interactionsSummary.lastExchangeAt
                      ? formatDate(interactionsSummary.lastExchangeAt)
                      : '—'}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-6 text-center">
                  <p className="text-sm text-slate-600">Ще немає обмінів.</p>
                </div>
              )}
            </section>

            <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Дії з акаунтом</h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button className="h-11 rounded-xl px-6 min-w-[180px]" onClick={() => setShowLogoutModal(true)}>
                  Вийти з акаунта
                </Button>
                <Button
                  className="h-11 rounded-xl from-red-600 to-red-700 text-white shadow-none hover:opacity-95 px-6 min-w-[180px]"
                  onClick={() => setShowDeleteModal(true)}
                >
                  Видалити акаунт
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </main>

      {showDeleteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Видалити акаунт?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Дія незворотна. Усі оголошення, повідомлення, обміни та рейтинги буде видалено назавжди.
            </p>

            {deleteError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Скасувати
              </Button>
              <Button
                className="h-11 flex-1 rounded-xl from-red-600 to-red-700 text-white shadow-none hover:opacity-95"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Видаляємо...' : 'Видалити'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showLogoutModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Вийти з акаунта?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Ви впевнені, що хочете завершити сеанс?
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                onClick={() => setShowLogoutModal(false)}
              >
                Скасувати
              </Button>
              <Button
                className="h-11 flex-1 rounded-xl"
                onClick={handleLogout}
              >
                Вийти
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
