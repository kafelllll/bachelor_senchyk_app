import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck, Sparkles } from 'lucide-react';

import { authService } from '../api/authService';
import { getNetworkErrorMessage } from '../utils/networkError';

const normalizeToken = (value: string | null) => (value ? value.trim() : '');
const CODE_LENGTH = 6;

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialToken = normalizeToken(searchParams.get('token'));
  const initialEmail = normalizeToken(searchParams.get('email'));

  const [code, setCode] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isLinkVerified, setIsLinkVerified] = useState(false);

  const canVerify = useMemo(() => code.trim().length === CODE_LENGTH, [code]);
  const canResend = useMemo(() => email.trim().length > 3, [email]);

  const handleVerifyCode = async () => {
    const codeValue = code.trim();
    if (codeValue.length !== CODE_LENGTH) {
      setVerifyError('Введіть 6-значний код з листа.');
      return;
    }

    try {
      setIsVerifying(true);
      setVerifyError(null);
      setVerifyMessage(null);
      const response = await authService.verifyEmailCode(codeValue);
      setVerifyMessage(response.message || 'Пошту підтверджено успішно.');
      setRedirectCountdown(2);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setVerifyError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyToken = async (tokenValue: string) => {
    if (!tokenValue) return;
    try {
      setIsVerifying(true);
      setVerifyError(null);
      setVerifyMessage(null);
      const response = await authService.verifyEmailToken(tokenValue);
      setVerifyMessage(response.message || 'Пошту підтверджено успішно.');
      setIsLinkVerified(true);
      setRedirectCountdown(2);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setVerifyError(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    const emailValue = email.trim();
    if (!emailValue) {
      setResendError('Вкажіть електронну адресу для повторного надсилання листа.');
      return;
    }

    try {
      setIsResending(true);
      setResendError(null);
      setResendMessage(null);
      const response = await authService.resendVerification(emailValue);
      setResendMessage(response.message || 'Лист з підтвердженням надіслано повторно.');
      setResendCooldown(30);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : getNetworkErrorMessage(error);
      setResendError(message);
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    if (initialToken) {
      handleVerifyToken(initialToken);
    }
  }, [initialToken]);

  useEffect(() => {
    if (!redirectCountdown || redirectCountdown <= 0) return;
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev ? prev - 1 : prev));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown]);

  useEffect(() => {
    if (redirectCountdown === 0) {
      navigate('/auth', { replace: true });
    }
  }, [redirectCountdown, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="mx-auto w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        {isLinkVerified && verifyMessage ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <MailCheck className="h-7 w-7 text-emerald-700" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-950">Електронну пошту підтверджено</h1>
            <p className="mt-2 text-sm text-slate-600">{verifyMessage}</p>
            {redirectCountdown !== null ? (
              <p className="mt-3 text-xs text-emerald-700">
                Переходимо до входу через {redirectCountdown} сек.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4" />
                Підтвердіть електронну пошту
              </div>
              <p className="mt-1 text-xs text-emerald-800">
                Ми надіслали 6-значний код на вашу пошту. Введіть його нижче.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <MailCheck className="h-6 w-6 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-950">Підтвердіть електронну пошту</h1>
                <p className="text-sm text-slate-600">
                  Введіть код з листа або повторно надішліть його нижче.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <label className="text-xs font-semibold text-slate-500">6-значний код</label>
              <input
                value={code}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                  setCode(next);
                }}
                inputMode="numeric"
                placeholder="000000"
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base tracking-[0.3em] text-slate-900 outline-none focus:border-emerald-500"
              />
              {verifyError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {verifyError}
                </div>
              ) : null}
              {verifyMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <div>{verifyMessage}</div>
                  {redirectCountdown !== null ? (
                    <div className="mt-1 text-xs text-emerald-700">
                      Переходимо до входу через {redirectCountdown} сек.
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={!canVerify || isVerifying}
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    !canVerify || isVerifying
                      ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                      : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                  }`}
                >
                  {isVerifying ? 'Перевіряємо...' : 'Підтвердити пошту'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/auth')}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  До входу
                </button>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">Немає листа?</h2>
              <p className="mt-1 text-sm text-slate-600">
                Вкажіть електронну адресу, і ми надішлемо лист повторно.
              </p>
              <div className="mt-3 space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Введіть електронну адресу"
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm text-slate-700 outline-none focus:border-emerald-500"
                />
                {resendError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {resendError}
                  </div>
                ) : null}
                {resendMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {resendMessage}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend || isResending || resendCooldown > 0}
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    !canResend || isResending || resendCooldown > 0
                      ? 'cursor-not-allowed border border-slate-200 text-slate-400'
                      : 'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95'
                  }`}
                >
                  {isResending
                    ? 'Надсилаємо...'
                    : resendCooldown > 0
                      ? `Надіслати ще раз (${resendCooldown})`
                      : 'Надіслати код ще раз'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
