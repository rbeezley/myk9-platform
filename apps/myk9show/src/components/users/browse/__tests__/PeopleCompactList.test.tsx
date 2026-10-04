import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PeopleCompactList } from '../PeopleCompactList';
import type { User } from '@/types/user-types';

const person = (id: string, firstName: string, lastName: string, email: string): User =>
  ({
    id,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email,
    roles: ['exhibitor'],
  }) as User;

const people = [
  person('p1', 'Ada', 'Lovelace', 'ada@example.com'),
  person('p2', 'Grace', 'Hopper', 'grace@example.com'),
];

const renderList = (selectedId?: string) =>
  render(
    <MemoryRouter>
      <PeopleCompactList people={people} selectedId={selectedId} />
    </MemoryRouter>
  );

describe('PeopleCompactList', () => {
  it('renders one link per person to /people/:id', () => {
    renderList();
    expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
      'href',
      '/people/p1'
    );
    expect(screen.getByRole('link', { name: /Grace Hopper/ })).toHaveAttribute(
      'href',
      '/people/p2'
    );
  });

  it('marks only the open person as current', () => {
    renderList('p2');
    expect(screen.getByRole('link', { name: /Grace Hopper/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: /Ada Lovelace/ })).not.toHaveAttribute('aria-current');
  });
});
