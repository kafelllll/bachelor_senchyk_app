import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';

type RenderWithRouterOptions = {
  route?: string;
};

export const renderWithRouter = (
  ui: ReactElement,
  options: RenderWithRouterOptions = {}
) => {
  const { route = '/' } = options;
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

