import { useEffect, useState } from 'react';
import { Bell, Leaf, User } from 'lucide-react';
import { io } from 'socket.io-client';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../api/authService';
import { exchangeService } from '../api/exchangeService';
import { messageService } from '../api/messageService';
import { dispatchRatingsUpdated } from '../utils/ratingsEvents';

type NavItem = {
  label: string;
  to?: string;
};

const navItems: NavItem[] = [
  { label: 'Головна', to: '/listings' },
  { label: 'Мої оголошення', to: '/my-announcements' },
  { label: 'Мої збіги', to: '/matches' },
  { label: 'Чат', to: '/messages' },
  { label: 'Мої обміни', to: '/exchanges' },
];

const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_BASE_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:3000';

export default function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(() => authService.getUserProfile());
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingExchangeCount, setPendingExchangeCount] = useState(0);

  useEffect(() => {
    const updateProfile = () => {
      setUserProfile(authService.getUserProfile());
    };

    window.addEventListener('auth-token-changed', updateProfile);
    window.addEventListener('storage', updateProfile);
    return () => {
      window.removeEventListener('auth-token-changed', updateProfile);
      window.removeEventListener('storage', updateProfile);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const count = await messageService.getUnreadCount();
        if (isMounted) setUnreadCount(count);
      } catch {
        if (isMounted) setUnreadCount(0);
      }
    };

    loadUnreadCount();

    const loadPendingExchanges = async () => {
      try {
        const count = await exchangeService.getPendingCount();
        if (!isMounted) return;
        setPendingExchangeCount(count);
      } catch {
        if (isMounted) {
          setPendingExchangeCount(0);
        }
      }
    };

    loadPendingExchanges();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const token = authService.getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_BASE_URL, { auth: { token } });
    socket.on('message:unread-count', (payload: { unreadCount?: number }) => {
      setUnreadCount(Number(payload?.unreadCount ?? 0));
    });
    socket.on('exchange:counts', (payload: { pendingCount?: number }) => {
      if (typeof payload?.pendingCount === 'number') {
        setPendingExchangeCount(payload.pendingCount);
      }
    });
    socket.on('rating:summary', (payload: { userId?: string; user?: { id?: string } } & Record<string, unknown>) => {
      const userId =
        (typeof payload?.userId === 'string' && payload.userId.trim()) ||
        (typeof payload?.user?.id === 'string' && payload.user.id.trim()) ||
        '';
      if (!userId) return;
      dispatchRatingsUpdated({
        userId,
        summary: {
          averageRating: typeof payload.averageRating === 'number' ? payload.averageRating : undefined,
          ratingsCount: typeof payload.ratingsCount === 'number' ? payload.ratingsCount : undefined,
          completedExchangesCount:
            typeof payload.completedExchangesCount === 'number'
              ? payload.completedExchangesCount
              : undefined,
          latestReviews: Array.isArray(payload.latestReviews)
            ? payload.latestReviews
            : undefined,
        },
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const avatar = userProfile?.avatar?.trim();

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="app-layout w-full px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d]">
              <Leaf className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">Plantch</span>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-9 px-8 lg:flex xl:gap-11">
            {navItems.map((item) => {
              const isActive = item.to ? location.pathname.startsWith(item.to) : false;
              const className = isActive
                ? 'text-base font-semibold tracking-[0.01em] text-green-700'
                : 'text-base font-medium tracking-[0.01em] text-slate-600 transition hover:text-green-700';

              if (item.to) {
                return (
                  <Link key={item.label} to={item.to} className={className}>
                    <span className="relative">
                      {item.label}
                      {item.label === 'Чат' && unreadCount > 0 ? (
                        <span className="absolute -right-5 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-semibold text-white">
                          {unreadCount}
                        </span>
                      ) : null}
                      {item.label === 'Мої обміни' && pendingExchangeCount > 0 ? (
                        <span className="absolute -right-5 -top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-semibold text-white">
                          {pendingExchangeCount}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              }

              return (
                <a key={item.label} href="#" className={className}>
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/create-listing"
              className="hidden rounded-xl bg-gradient-to-r from-[#2e7d32] to-[#49b04d] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] transition hover:opacity-95 md:block"
            >
              Створити оголошення
            </Link>

            <button className="relative rounded-lg p-2 transition hover:bg-gray-100" type="button">
              <Bell className="h-5 w-5 text-slate-600" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-green-100 transition hover:opacity-90"
            >
              {avatar ? (
                <img src={avatar} alt="Аватар користувача" className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-green-700" />
              )}
            </button>
          </div>
        </div>
      </div>

    </header>
  );
}
