import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import CreateListingPage from './pages/CreateListingPage';
import EditAnnouncementPage from './pages/EditAnnouncementPage';
import ListingsPage from './pages/ListingsPage';
import ListingDetailsPage from './pages/ListingDetailsPage';
import MyAnnouncementsPage from './pages/MyAnnouncementsPage';
import MatchesPage from './pages/MatchesPage';
import AnnouncementMatchesPage from './pages/AnnouncementMatchesPage';
import ProfilePage from './pages/ProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import MessagesPage from './pages/MessagesPage';
import ExchangesPage from './pages/ExchangesPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import { authService } from './api/authService';

function LegacyAnnouncementMatchesRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/my-announcements/${id}/matches`} replace />;
}

function ProtectedRoute({
  isLoggedIn,
  children,
}: {
  isLoggedIn: boolean;
  children: ReactNode;
}) {
  return isLoggedIn ? <>{children}</> : <Navigate to="/auth" replace />;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(authService.getToken()));
  const location = useLocation();

  useEffect(() => {
    const updateAuth = () => {
      setIsLoggedIn(Boolean(authService.getToken()));
    };

    window.addEventListener('auth-token-changed', updateAuth);
    window.addEventListener('storage', updateAuth);

    return () => {
      window.removeEventListener('auth-token-changed', updateAuth);
      window.removeEventListener('storage', updateAuth);
    };
  }, []);

  return (
    <Routes location={location} key={location.pathname}>
      <Route
        path="/"
        element={<Navigate to={isLoggedIn ? '/listings' : '/auth'} replace />}
      />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/my-announcements"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <MyAnnouncementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-announcements/:id/edit"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <EditAnnouncementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/listings"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ListingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/listings/:id"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ListingDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/matches"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <MatchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-announcements/:id/matches"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <AnnouncementMatchesPage />
          </ProtectedRoute>
        }
      />
      <Route path="/announcements/:id/matches" element={<LegacyAnnouncementMatchesRedirect />} />
      <Route
        path="/messages"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <MessagesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/exchanges"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ExchangesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-exchanges"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ExchangesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ExchangesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-listing"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <CreateListingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute isLoggedIn={isLoggedIn}>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
