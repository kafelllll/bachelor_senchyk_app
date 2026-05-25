import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from '../ProfilePage';
import { renderWithRouter } from '../../test/utils/renderWithRouter';

const { mockedProfileService, mockedAuthService } = vi.hoisted(() => ({
  mockedProfileService: {
    getMe: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  mockedAuthService: {
    setUserProfile: vi.fn(),
    logout: vi.fn(),
    clearToken: vi.fn(),
  },
}));

vi.mock('../../components/AppHeader', () => ({
  default: () => <div data-testid="app-header-mock" />,
}));

vi.mock('../../api/profileService', () => ({
  profileService: mockedProfileService,
}));

vi.mock('../../api/authService', () => ({
  authService: mockedAuthService,
}));

vi.mock('../../hooks/useRatingsCache', () => ({
  useRatingsCache: () => ({ ratingsByUserId: {}, isLoading: false }),
}));

const profileFixture = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  city: 'Kyiv',
  bio: 'Plant lover',
  avatar: 'https://example.com/avatar.jpg',
  trustScore: 78,
  trustLevel: 'sufficient',
  ratingSummary: {
    averageRating: 4.6,
    ratingsCount: 8,
    completedExchangesCount: 3,
    latestReviews: [],
  },
  interactionsSummary: {
    activeCount: 1,
    completedCount: 3,
    cancelledCount: 0,
    totalCount: 4,
  },
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProfileService.getMe.mockResolvedValue(profileFixture);
    mockedProfileService.update.mockResolvedValue({
      ...profileFixture,
      name: 'Updated User',
    });
    mockedProfileService.remove.mockResolvedValue(undefined);
    mockedAuthService.logout.mockResolvedValue(undefined);
  });

  it('renders profile name, email, rating and trust score', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>,
      { route: '/profile' }
    );

    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText(/8 оцінок/i)).toBeInTheDocument();
    expect(screen.getAllByText('78').length).toBeGreaterThan(0);
  });

  it('saves profile edits through mocked profileService', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>,
      { route: '/profile' }
    );

    await screen.findByText('Test User');
    fireEvent.click(screen.getByRole('button', { name: 'Редагувати профіль' }));

    const nameInput = screen.getByDisplayValue('Test User');
    fireEvent.change(nameInput, { target: { value: 'Updated User' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() => {
      expect(mockedProfileService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated User',
        })
      );
    });
  });

  it('opens delete modal and confirms account deletion', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/auth" element={<div>Auth route</div>} />
      </Routes>,
      { route: '/profile' }
    );

    await screen.findByText('Test User');
    fireEvent.click(screen.getByRole('button', { name: 'Видалити акаунт' }));

    expect(screen.getByRole('heading', { name: 'Видалити акаунт?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));

    await waitFor(() => {
      expect(mockedProfileService.remove).toHaveBeenCalledTimes(1);
      expect(mockedAuthService.clearToken).toHaveBeenCalledTimes(1);
    });
  });
});
