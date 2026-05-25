import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import AuthPage from '../AuthPage';
import { renderWithRouter } from '../../test/utils/renderWithRouter';

const { mockedAuthService } = vi.hoisted(() => ({
  mockedAuthService: {
    setToken: vi.fn(),
    getToken: vi.fn(() => null),
    setUserId: vi.fn(),
    setUserProfile: vi.fn(),
    getUserProfile: vi.fn(() => null),
    getUserId: vi.fn(() => null),
    clearToken: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    verifyEmailToken: vi.fn(),
    verifyEmailCode: vi.fn(),
    verifyEmailLink: vi.fn(),
    resendVerification: vi.fn(),
  },
}));

vi.mock('../../api/authService', () => ({
  authService: mockedAuthService,
}));

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthService.getToken.mockReturnValue(null);
    mockedAuthService.login.mockResolvedValue({
      message: 'ok',
      token: 'token-1',
      user: { id: 'user-1', email: 'john@example.com', name: 'John' },
    });
  });

  it('renders login and register forms', () => {
    const { container } = renderWithRouter(<AuthPage />, { route: '/auth' });

    expect(screen.getByPlaceholderText('Введіть електронну адресу')).toBeInTheDocument();

    const tabs = container.querySelectorAll('.tab-button');
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(tabs[1] as HTMLButtonElement);

    expect(container.querySelector('input[type="checkbox"]')).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="password"]').length).toBeGreaterThanOrEqual(2);
  });

  it('shows validation protection for empty login form', async () => {
    const { container } = renderWithRouter(<AuthPage />, { route: '/auth' });
    const submitButton = container.querySelector('.auth-form button[type="submit"]');
    expect(submitButton).toBeInTheDocument();

    fireEvent.click(submitButton as HTMLButtonElement);

    await waitFor(() => {
      expect(mockedAuthService.login).not.toHaveBeenCalled();
    });
  });

  it('logs in successfully and redirects to listings route', async () => {
    const { container } = renderWithRouter(
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/listings" element={<div>Listings Screen</div>} />
      </Routes>,
      { route: '/auth' }
    );

    const emailInput = screen.getByPlaceholderText('Введіть електронну адресу');
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    const submitButton = container.querySelector('.auth-form button[type="submit"]') as HTMLButtonElement;

    fireEvent.change(emailInput, { target: { value: 'john@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'StrongPass123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith('john@example.com', 'StrongPass123');
      expect(mockedAuthService.setToken).toHaveBeenCalledWith('token-1');
      expect(mockedAuthService.setUserId).toHaveBeenCalledWith('user-1');
      expect(mockedAuthService.setUserProfile).toHaveBeenCalled();
    });

    expect(await screen.findByText('Listings Screen')).toBeInTheDocument();
  });
});
