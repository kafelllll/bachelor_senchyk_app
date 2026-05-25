import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditAnnouncementPage from '../EditAnnouncementPage';
import { renderWithRouter } from '../../test/utils/renderWithRouter';

const { mockedAnnouncementService, mockedAuthService } = vi.hoisted(() => ({
  mockedAnnouncementService: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  mockedAuthService: {
    getUserId: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock('../../components/AppHeader', () => ({
  default: () => <div data-testid="app-header-mock" />,
}));

vi.mock('../../components/UploadImage', () => ({
  default: ({ onUpload }: { onUpload?: (url: string, key: string) => void }) => (
    <button
      type="button"
      onClick={() => onUpload?.('https://example.com/new-image.jpg', 'key-2')}
    >
      Mock upload image
    </button>
  ),
}));

vi.mock('../../api/announcementService', () => ({
  announcementService: mockedAnnouncementService,
  AnnouncementServiceError: class extends Error {
    status?: number;
    issues?: unknown[];
  },
}));

vi.mock('../../api/authService', () => ({
  authService: mockedAuthService,
}));

const buildListingPayload = () => ({
  id: '1',
  userId: 'user-1',
  plantName: 'Monstera deliciosa',
  commonName: 'Monstera',
  genus: 'Monstera',
  family: 'Araceae',
  offerType: 'offer',
  category: 'indoor',
  size: 'medium',
  condition: 'healthy',
  careLevel: 'easy',
  city: 'Kyiv',
  district: 'Podil',
  description: 'Healthy home plant',
  images: ['https://example.com/old-image.jpg'],
  wateringFreq: 'moderate',
  lightReqs: 'bright',
});

describe('EditAnnouncementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthService.getUserId.mockReturnValue('user-1');
    mockedAuthService.me.mockResolvedValue({ id: 'user-1', name: 'John' });
    mockedAnnouncementService.getById.mockResolvedValue(buildListingPayload());
    mockedAnnouncementService.update.mockResolvedValue({ success: true });
  });

  it('blocks submit when required field is empty', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/my-announcements/:id/edit" element={<EditAnnouncementPage />} />
      </Routes>,
      { route: '/my-announcements/1/edit' }
    );

    const plantNameInput = await screen.findByPlaceholderText('Наприклад, Монстера делікатесна');
    fireEvent.change(plantNameInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() => {
      expect(mockedAnnouncementService.update).not.toHaveBeenCalled();
    });
  });

  it('handles image upload callback in edit form', async () => {
    const { container } = renderWithRouter(
      <Routes>
        <Route path="/my-announcements/:id/edit" element={<EditAnnouncementPage />} />
      </Routes>,
      { route: '/my-announcements/1/edit' }
    );

    await screen.findByRole('button', { name: 'Зберегти зміни' });
    fireEvent.click(screen.getByRole('button', { name: 'Mock upload image' }));

    await waitFor(() => {
      const image = container.querySelector('img[src="https://example.com/new-image.jpg"]');
      expect(image).toBeInTheDocument();
    });
  });

  it('submits updated listing successfully', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/my-announcements/:id/edit" element={<EditAnnouncementPage />} />
        <Route path="/my-announcements" element={<div>My announcements route</div>} />
      </Routes>,
      { route: '/my-announcements/1/edit' }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() => {
      expect(mockedAnnouncementService.update).toHaveBeenCalledTimes(1);
      expect(mockedAnnouncementService.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          plantName: 'Monstera deliciosa',
          city: 'Kyiv',
        })
      );
    });
  });
});
