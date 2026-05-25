import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Leaf,
  User as UserIcon,
} from 'lucide-react';
import { authService, type AuthResponse } from '../api/authService';
import { validateEmail, validatePassword, validateName } from '../utils/validation';
import { getNetworkErrorMessage } from '../utils/networkError';
import '../styles/auth.css';

type AuthMode = 'login' | 'register';

interface LoginForm {
  email: string;
  password: string;
}

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

const localizeVerifyEmailMessage = (message?: string | null) => {
  const fallback = 'Перевірте пошту, щоб підтвердити адресу електронної пошти.';
  if (!message?.trim()) return fallback;

  const normalized = message.trim().toLowerCase();
  if (
    normalized === 'verification email sent' ||
    normalized === 'verification email has been sent'
  ) {
    return 'Лист для підтвердження електронної пошти надіслано.';
  }

  return message;
};

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastRegisteredEmail, setLastRegisteredEmail] = useState<string | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: '',
    password: '',
  });

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
  });

  const handleLoginChange = (field: keyof LoginForm, value: string) => {
    if (error) {
      setError(null);
    }
    if (successMessage) {
      setSuccessMessage(null);
    }
    setLoginForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRegisterChange = (
    field: keyof RegisterForm,
    value: string | boolean
  ) => {
    if (error) {
      setError(null);
    }
    if (successMessage) {
      setSuccessMessage(null);
    }
    setRegisterForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
  };

  useEffect(() => {
    setIsCheckingAuth(false);
  }, []);

  const applyAuthResponse = async (data: AuthResponse) => {
    if (data.token) {
      authService.setToken(data.token);
    }

    if (data.user) {
      authService.setUserId(data.user.id);
      authService.setUserProfile(data.user);
      return;
    }

    if (data.token) {
      const me = await authService.me();
      authService.setUserId(me.id);
      authService.setUserProfile(me);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const emailValidation = validateEmail(loginForm.email);
    if (!emailValidation.valid) {
      setError(emailValidation.error || 'Невірна електронна адреса.');
      return;
    }

    const passwordValidation = validatePassword(loginForm.password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error || 'Невірний пароль.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await authService.login(loginForm.email.trim(), loginForm.password.trim());
      await applyAuthResponse(data);
      navigate('/listings', { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(getNetworkErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const nameValidation = validateName(registerForm.name);
    if (!nameValidation.valid) {
      setError(nameValidation.error || 'Невірне ім\'я.');
      return;
    }

    const emailValidation = validateEmail(registerForm.email);
    if (!emailValidation.valid) {
      setError(emailValidation.error || 'Невірна електронна адреса.');
      return;
    }

    const passwordValidation = validatePassword(registerForm.password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error || 'Невірний пароль.');
      return;
    }

    const confirmPasswordValidation = validatePassword(registerForm.confirmPassword);
    if (!confirmPasswordValidation.valid) {
      setError(confirmPasswordValidation.error || 'Невірне підтвердження пароля.');
      return;
    }

    if (registerForm.password.trim() !== registerForm.confirmPassword.trim()) {
      setError('Паролі не збігаються. Переконайтеся, що обидва поля однакові.');
      return;
    }

    if (!registerForm.termsAccepted) {
      setError('Будь ласка, прийміть Умови користування та Політику конфіденційності, щоб продовжити.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await authService.register({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password.trim(),
        confirmPassword: registerForm.confirmPassword.trim(),
        termsAccepted: registerForm.termsAccepted,
      });
      setLastRegisteredEmail(registerForm.email.trim());
      setSuccessMessage(localizeVerifyEmailMessage(data.message));
      setShowVerifyModal(true);
      setRegisterForm({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        termsAccepted: false,
      });
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(getNetworkErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-left-overlay"></div>

        <div className="auth-left-content">
          <div className="auth-logo-circle">
            <Leaf size={28} strokeWidth={2.2} />
          </div>

          <h1 className="auth-brand-title">Plantch</h1>
          <p className="auth-brand-subtitle">Обмінюйся рослинами. Рости разом.</p>

          <p className="auth-brand-description">
            Приєднуйся до спільноти любителів рослин, які діляться живцями,
            обмінюються насінням та разом вирощують екосади.
          </p>
        </div>
      </div>

      <div
        className={
          mode === 'login'
            ? 'auth-right auth-right-login'
            : 'auth-right auth-right-register'
        }
      >
        <div className="auth-card">
          <div className="auth-header">
            <h2>{mode === 'login' ? 'Вітаємо!' : 'Створити акаунт'}</h2>
            <p>
              {mode === 'login'
                ? 'Увійдіть, щоб продовжити обмін рослинами'
                : 'Приєднуйтесь до спільноти обміну рослинами'}
            </p>
          </div>

          {error && (
            <div style={{ color: '#dc2626', marginBottom: '16px', padding: '10px', backgroundColor: '#fee2e2', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          {showVerifyModal && successMessage ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-bold text-slate-900">Підтвердіть пошту</h3>
                <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50"
                    onClick={() => setShowVerifyModal(false)}
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95"
                    onClick={() => {
                      setShowVerifyModal(false);
                      if (lastRegisteredEmail) {
                        navigate(`/verify-email?email=${encodeURIComponent(lastRegisteredEmail)}`);
                      }
                    }}
                  >
                    Підтвердити пошту зараз
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isCheckingAuth && (
            <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#e0f2fe', borderRadius: '6px', color: '#075985' }}>
              Перевіряємо вашу сесію...
            </div>
          )}

          <>
            <div className="auth-tabs">
                <button
                  type="button"
                  className={mode === 'login' ? 'tab-button active' : 'tab-button'}
                  onClick={() => handleModeChange('login')}
                >
                  Вхід
                </button>
                <button
                  type="button"
                  className={
                    mode === 'register' ? 'tab-button active' : 'tab-button'
                  }
                  onClick={() => handleModeChange('register')}
                >
                  Реєстрація
                </button>
              </div>

              {mode === 'login' ? (
                <form className="auth-form" onSubmit={handleLoginSubmit}>
                  <div className="form-group">
                    <label>Електронна адреса</label>
                    <div className="input-wrapper">
                      <Mail className="input-icon" size={17} />
                      <input
                        type="email"
                        placeholder="Введіть електронну адресу"
                        value={loginForm.email}
                        onChange={(e) =>
                          handleLoginChange('email', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Пароль</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={17} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={(e) =>
                          handleLoginChange('password', e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="eye-button"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                      </button>
                    </div>
                  </div>

                  <div className="auth-link-row">
                    <button type="button" className="text-link">
                      Забули пароль?
                    </button>
                  </div>

                  <button type="submit" className="primary-button" disabled={isLoading}>
                    {isLoading ? 'Виконується вхід...' : 'Увійти'}
                  </button>

                  <p className="switch-text">
                    Немає акаунта?{' '}
                    <button
                      type="button"
                      className="text-link inline-link"
                      onClick={() => handleModeChange('register')}
                    >
                      Зареєструватися
                    </button>
                  </p>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleRegisterSubmit}>
                  <div className="form-group">
                    <label>Повне ім'я</label>
                    <div className="input-wrapper">
                      <UserIcon className="input-icon" size={17} />
                      <input
                        type="text"
                        placeholder="Введіть повне ім'я"
                        value={registerForm.name}
                        onChange={(e) =>
                          handleRegisterChange('name', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Електронна адреса</label>
                    <div className="input-wrapper">
                      <Mail className="input-icon" size={17} />
                      <input
                        type="email"
                        placeholder="Введіть електронну адресу"
                        value={registerForm.email}
                        onChange={(e) =>
                          handleRegisterChange('email', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Пароль</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={17} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={registerForm.password}
                        onChange={(e) =>
                          handleRegisterChange('password', e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="eye-button"
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Підтвердіть пароль</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={17} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={registerForm.confirmPassword}
                        onChange={(e) =>
                          handleRegisterChange('confirmPassword', e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="eye-button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                      >
                        {showConfirmPassword ? (
                          <Eye size={17} />
                        ) : (
                          <EyeOff size={17} />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={registerForm.termsAccepted}
                      onChange={(e) =>
                        handleRegisterChange('termsAccepted', e.target.checked)
                      }
                    />
                    <span>
                      Я погоджуюся з <a href="#">Умовами користування</a> та{' '}
                      <a href="#">Політикою конфіденційності</a>
                    </span>
                  </label>

                  <button type="submit" className="primary-button" disabled={isLoading}>
                    {isLoading ? 'Створення акаунта...' : 'Створити акаунт'}
                  </button>

                  <p className="switch-text">
                    Вже маєте акаунт?{' '}
                    <button
                      type="button"
                      className="text-link inline-link"
                      onClick={() => handleModeChange('login')}
                    >
                      Увійти
                    </button>
                  </p>
                </form>
              )}
            </>
        </div>

        <div className="trust-block">
          <p>Довіряють любителі рослин у всьому світі</p>
          <div className="trust-items">
            <span>✓ Безпечно</span>
            <span>✓ Приватно</span>
            <span>✓ Спільнотний проєкт</span>
          </div>
        </div>
      </div>
    </div>
  );
}
