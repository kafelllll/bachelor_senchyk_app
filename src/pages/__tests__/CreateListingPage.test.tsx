import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CreateListingPage from '../CreateListingPage';
import { renderWithRouter } from '../../test/utils/renderWithRouter';

const { mockedAnnouncementService, mockedAuthService, mockedPlantNetService } = vi.hoisted(() => ({
  mockedAnnouncementService: {
    create: vi.fn(),
  },
  mockedAuthService: {
    me: vi.fn(),
    getToken: vi.fn(() => 'token-1'),
    getUserId: vi.fn(() => 'user-1'),
    setUserId: vi.fn(),
    setUserProfile: vi.fn(),
    clearToken: vi.fn(),
  },
  mockedPlantNetService: {
    searchByName: vi.fn(),
    fetchByName: vi.fn(),
  },
}));

vi.mock('../../components/AppHeader', () => ({
  default: () => <div data-testid="app-header-mock" />,
}));

vi.mock('../../components/UploadImage', () => ({
  default: ({ onUpload }: { onUpload?: (url: string, key: string) => void }) => (
    <button
      type="button"
      onClick={() => onUpload?.('https://example.com/uploaded.jpg', 'image-key-1')}
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

vi.mock('../../api/plantIdentifyService', () => ({
  plantIdentifyService: {
    identify: vi.fn(),
  },
}));

vi.mock('../../api/plantNetService', () => ({
  plantNetService: mockedPlantNetService,
}));

describe('CreateListingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAnnouncementService.create.mockResolvedValue({ success: true, announcement: { id: 'ann-1' } });
    mockedAuthService.me.mockResolvedValue({ id: 'user-1', name: 'John Doe' });
    mockedPlantNetService.searchByName.mockResolvedValue([
      {
        common_name: 'Монстера',
        scientific_name: 'Monstera deliciosa',
        genus: 'Monstera',
        family: 'Araceae',
      },
    ]);
  });

  it('renders create listing form and blocks submit when required data is missing', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/create-listing" element={<CreateListingPage />} />
      </Routes>,
      { route: '/create-listing' }
    );

    expect(await screen.findByText('Тип оголошення')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Створити оголошення' }));

    await waitFor(() => {
      expect(mockedAnnouncementService.create).not.toHaveBeenCalled();
    });
  });

  it('submits successfully through mocked announcementService.create', async () => {
    renderWithRouter(
      <Routes>
        <Route path="/create-listing" element={<CreateListingPage />} />
      </Routes>,
      { route: '/create-listing' }
    );

    const plantNameInput = await screen.findByPlaceholderText('Наприклад: Монстера Делікатесна');
    fireEvent.change(plantNameInput, { target: { value: 'Monstera deliciosa' } });

    fireEvent.click(screen.getByRole('button', { name: 'Кімнатна' }));
    fireEvent.click(screen.getByRole('button', { name: 'Великий' }));
    fireEvent.click(screen.getByRole('button', { name: 'Здорова' }));
    fireEvent.click(screen.getByRole('button', { name: 'Легкий' }));
    fireEvent.click(screen.getByRole('button', { name: 'Рідко' }));
    fireEvent.click(screen.getByRole('button', { name: 'Яскраве світло' }));

    fireEvent.change(screen.getByPlaceholderText('Місто'), {
      target: { value: 'Київ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mock upload image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Знайти за назвою' }));

    await waitFor(() => {
      expect(mockedPlantNetService.searchByName).toHaveBeenCalledWith('Monstera deliciosa');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Використати результат' }));
    fireEvent.click(screen.getByRole('button', { name: 'Створити оголошення' }));

    await waitFor(() => {
      expect(mockedAnnouncementService.create).toHaveBeenCalledTimes(1);
      expect(mockedAnnouncementService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          plantName: 'Монстера',
          city: 'Київ',
          imageUrl: 'https://example.com/uploaded.jpg',
        })
      );
    });
  });
});
