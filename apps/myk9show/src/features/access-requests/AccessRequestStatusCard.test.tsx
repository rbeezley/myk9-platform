import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessRequestStatusCard } from './AccessRequestStatusCard';
import { useMyAccessRequests } from './useAccessRequests';
import type { ClubAccessRequest } from './accessRequestTypes';

vi.mock('./useAccessRequests', () => ({
  useMyAccessRequests: vi.fn(),
}));

const baseRequest: ClubAccessRequest = {
  id: 'request-1',
  requester_person_id: 'person-1',
  requester_auth_user_id: 'auth-1',
  requested_club_name: 'River City Scent Work Club',
  requested_club_website: null,
  request_note: null,
  status: 'pending',
  approved_club_id: null,
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-05-24T12:00:00Z',
  updated_at: '2026-05-24T12:00:00Z',
};

describe('AccessRequestStatusCard', () => {
  beforeEach(() => {
    vi.mocked(useMyAccessRequests).mockReset();
  });

  it('renders nothing when the requester has no club access requests', () => {
    vi.mocked(useMyAccessRequests).mockReturnValue({ data: [], isLoading: false } as never);

    const { container } = render(<AccessRequestStatusCard />);

    expect(container.firstChild).toBeNull();
  });

  it('shows a pending club access request', () => {
    vi.mocked(useMyAccessRequests).mockReturnValue({
      data: [baseRequest],
      isLoading: false,
    } as never);

    render(<AccessRequestStatusCard />);

    expect(screen.getByText('Club access request pending')).toBeInTheDocument();
    expect(screen.getByText('River City Scent Work Club')).toBeInTheDocument();
  });

  it('shows an approved club access request', () => {
    vi.mocked(useMyAccessRequests).mockReturnValue({
      data: [{ ...baseRequest, status: 'approved', review_note: 'Welcome aboard.' }],
      isLoading: false,
    } as never);

    render(<AccessRequestStatusCard />);

    expect(screen.getByText('Club access approved')).toBeInTheDocument();
    expect(screen.getByText('Welcome aboard.')).toBeInTheDocument();
  });

  it('shows a denied club access request', () => {
    vi.mocked(useMyAccessRequests).mockReturnValue({
      data: [{ ...baseRequest, status: 'denied', review_note: 'Could not verify club authority.' }],
      isLoading: false,
    } as never);

    render(<AccessRequestStatusCard />);

    expect(screen.getByText('Club access request denied')).toBeInTheDocument();
    expect(screen.getByText('Could not verify club authority.')).toBeInTheDocument();
  });
});
