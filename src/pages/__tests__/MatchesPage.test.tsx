import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MatchCard from '../../components/matches/MatchCard';
import MatchesPage from '../MatchesPage';
import { renderWithRouter } from '../../test/utils/renderWithRouter';
import type { Recommendation } from '../../utils/announcementMapping';

const { mockedAnnouncementService, mockedAuthService } = vi.hoisted(() => ({
  mockedAnnouncementService: {
    listRecommendations: vi.fn(),
  },
  mockedAuthService: {
    getUserId: vi.fn(),
  },
}));

vi.mock('../../components/AppHeader', () => ({
  default: () => <div data-testid="app-header-mock" />,
}));

vi.mock('../../api/announcementService', () => ({
  announcementService: mockedAnnouncementService,
}));

vi.mock('../../api/exchangeService', () => ({
  exchangeService: {
    create: vi.fn(),
  },
}));

vi.mock('../../api/authService', () => ({
  authService: mockedAuthService,
}));

vi.mock('../../hooks/useRatingsCache', () => ({
  useRatingsCache: () => ({ ratingsByUserId: {}, isLoading: false }),
}));

const recommendationFixture: Recommendation = {
  id: 'rec-1',
  userId: 'user-2',
  userAvatar: '',
  plantName: 'Monstera Adansonii',
  commonName: 'Monkey Mask',
  scientificName: 'Monstera adansonii',
  genus: 'Monstera',
  family: 'Araceae',
  type: 'offering',
  description: 'Great for bright rooms',
  image: 'https://example.com/monstera.jpg',
  images: ['https://example.com/monstera.jpg'],
  city: 'Lviv',
  district: 'Center',
  location: 'Lviv, Center',
  postedDate: '2026-05-24',
  status: 'active',
  category: 'indoor',
  size: 'medium',
  condition: 'healthy',
  careLevel: 'easy',
  wateringFreq: 'moderate',
  lightReqs: 'bright',
  userName: 'Nadia',
  userRating: 4.8,
  ratingsCount: 5,
  completedExchanges: 3,
  matchScore: 92,
  matchLevel: 'high',
};

describe('Matches UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthService.getUserId.mockReturnValue('user-1');
    mockedAnnouncementService.listRecommendations.mockResolvedValue([]);
  });

  it('renders match score and match level in MatchCard', () => {
    renderWithRouter(
      <MatchCard
        match={recommendationFixture}
        onProposeExchange={vi.fn()}
      />
    );

    expect(screen.getByText('Monstera Adansonii')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('shows loading and empty state when no recommendations are available', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    mockedAnnouncementService.listRecommendations.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRequest = resolve;
        })
    );

    renderWithRouter(
      <Routes>
        <Route path="/matches" element={<MatchesPage />} />
      </Routes>,
      { route: '/matches' }
    );

    expect(screen.getByText('Завантажуємо збіги...')).toBeInTheDocument();

    if (resolveRequest) {
      resolveRequest([]);
    }

    await waitFor(() => {
      expect(screen.getByText('Поки що немає рекомендованих оголошень.')).toBeInTheDocument();
    });
  });
});
