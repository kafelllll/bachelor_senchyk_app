import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ListingCard from '../ListingCard';
import { renderWithRouter } from '../../test/utils/renderWithRouter';
import type { BaseListing } from '../../utils/announcementMapping';

const listingFixture: BaseListing = {
  id: 'listing-1',
  userId: 'user-2',
  userAvatar: '',
  plantName: 'Ficus Elastica',
  commonName: 'Rubber Plant',
  scientificName: 'Ficus elastica',
  genus: 'Ficus',
  family: 'Moraceae',
  type: 'offering',
  description: 'Healthy plant in pot',
  image: 'https://example.com/ficus.jpg',
  images: ['https://example.com/ficus.jpg'],
  city: 'Kyiv',
  district: 'Podil',
  location: 'Kyiv, Podil',
  postedDate: '2026-05-24',
  status: 'active',
  category: 'indoor',
  size: 'medium',
  condition: 'healthy',
  careLevel: 'easy',
  wateringFreq: 'moderate',
  lightReqs: 'bright',
  userName: 'Ihor',
  userRating: 4.7,
  ratingsCount: 10,
  completedExchanges: 5,
  matchScore: 87,
  matchLevel: 'high',
};

describe('ListingCard', () => {
  it('renders plant name, location, type and primary actions', () => {
    const onExchangeClick = vi.fn();

    renderWithRouter(
      <ListingCard
        listing={listingFixture}
        typeLabel="Пропоную"
        typeClass="bg-green-100 text-green-700"
        categoryLabel="Кімнатна"
        sizeLabel="Середній"
        conditionLabel="Здорова"
        careLabel="Легкий догляд"
        messageLink="/messages?userId=user-2"
        exchangeAction={{
          label: 'Запропонувати обмін',
          onClick: onExchangeClick,
        }}
      />
    );

    expect(screen.getByText('Ficus Elastica')).toBeInTheDocument();
    expect(screen.getByText('Kyiv, Podil')).toBeInTheDocument();
    expect(screen.getByText('Пропоную')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запропонувати обмін' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Написати повідомлення/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Запропонувати обмін' }));
    expect(onExchangeClick).toHaveBeenCalledTimes(1);
  });
});

