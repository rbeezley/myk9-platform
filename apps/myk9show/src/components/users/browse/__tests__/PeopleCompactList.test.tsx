import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

  it('announces the open person, since focus stays on the list', () => {
    const { rerender } = renderList();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(
      <MemoryRouter>
        <PeopleCompactList people={people} selectedId="p2" />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing details for Grace Hopper');
  });

  describe('keyboard', () => {
    function Probe() {
      return <p data-testid="at">{useLocation().pathname}</p>;
    }
    const renderKeyboard = () =>
      render(
        <MemoryRouter initialEntries={['/people/p1']}>
          <PeopleCompactList people={people} selectedId="p1" />
          <Probe />
        </MemoryRouter>
      );

    it('Down opens and focuses the next person, Up the previous', async () => {
      renderKeyboard();
      screen.getByRole('link', { name: /Ada Lovelace/ }).focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getByTestId('at')).toHaveTextContent('/people/p2');
      expect(screen.getByRole('link', { name: /Grace Hopper/ })).toHaveFocus();

      await userEvent.keyboard('{ArrowUp}');
      expect(screen.getByTestId('at')).toHaveTextContent('/people/p1');
      expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveFocus();
    });

    it('leaves Cmd/Ctrl/Alt/Shift + arrows to the browser', async () => {
      renderKeyboard();
      screen.getByRole('link', { name: /Ada Lovelace/ }).focus();
      await userEvent.keyboard('{Meta>}{ArrowDown}{/Meta}');
      await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
      expect(screen.getByTestId('at')).toHaveTextContent('/people/p1');
    });

    it('stops at the ends instead of wrapping or leaving the list', async () => {
      renderKeyboard();
      screen.getByRole('link', { name: /Ada Lovelace/ }).focus();
      await userEvent.keyboard('{ArrowUp}');
      expect(screen.getByTestId('at')).toHaveTextContent('/people/p1');

      screen.getByRole('link', { name: /Grace Hopper/ }).focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getByTestId('at')).toHaveTextContent('/people/p1');
    });
  });
});
