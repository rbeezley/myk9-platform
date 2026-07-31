/**
 * MYK9-134. This tile used to render a hardcoded "Active" badge for every
 * person, including contact records with no auth identity — the same
 * "the UI says it worked" failure as MYK9-131. These tests pin it to real data.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import AccountSummaryCard from './AccountSummaryCard';
import type { User } from '@/types/dog-types';

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'person-1',
    firstName: 'Pat',
    lastName: 'Secretary',
    email: 'pat@example.test',
    ...overrides,
  }) as User;

describe('AccountSummaryCard — sign-in access', () => {
  it('reports "No account" for a person with no auth identity', () => {
    // `user_id` is the mapped people.auth_user_id; absent means nobody can log
    // in as this record.
    render(<AccountSummaryCard person={person()} dogCount={0} />);

    expect(screen.getByText(/no account/i)).toBeInTheDocument();
    expect(screen.queryByText(/can sign in/i)).not.toBeInTheDocument();
  });

  it('reports "Can sign in" once an auth identity exists', () => {
    render(<AccountSummaryCard person={person({ user_id: 'auth-uuid' })} dogCount={0} />);

    expect(screen.getByText(/can sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/no account/i)).not.toBeInTheDocument();
  });

  it('never claims a blanket "Active" status again', () => {
    // The regression guard: the old markup hardcoded this string.
    render(<AccountSummaryCard person={person()} dogCount={0} />);

    expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
  });
});
