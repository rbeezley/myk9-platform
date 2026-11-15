import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EmailContentView } from './EmailContentView';
import type { EmailContent } from './api';

const { mockFetchContent } = vi.hoisted(() => ({
  mockFetchContent: vi.fn<(...args: never[]) => Promise<EmailContent | null>>(),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchShowEmailContent: mockFetchContent };
});

describe('EmailContentView (MYK9-1999)', () => {
  beforeEach(() => {
    mockFetchContent.mockReset();
  });

  it('reads nothing until asked, then shows the subject and the email as sent, sandboxed', async () => {
    mockFetchContent.mockResolvedValue({
      subject: 'Your entry to Fall Trial is confirmed',
      bodyHtml: '<p>Armband 142</p>',
      bodyText: null,
    });
    const { user } = render(<EmailContentView emailLogId="log-1" />);
    expect(mockFetchContent).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Read this email' }));

    expect(await screen.findByText('Your entry to Fall Trial is confirmed')).toBeInTheDocument();
    const frame = screen.getByTitle('Email: Your entry to Fall Trial is confirmed');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>Armband 142</p>');
    expect(mockFetchContent).toHaveBeenCalledWith(expect.objectContaining({ emailLogId: 'log-1' }));
    expect(screen.getByRole('button', { name: 'Hide this email' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('shows a lifecycle email as its text', async () => {
    mockFetchContent.mockResolvedValue({
      subject: 'Entry accepted',
      bodyHtml: null,
      bodyText: 'Hi Ada,\n\nYour entry has been accepted.',
    });
    const { user } = render(<EmailContentView emailLogId="log-2" />);
    await user.click(screen.getByRole('button', { name: 'Read this email' }));
    expect(await screen.findByText(/Your entry has been accepted\./)).toBeInTheDocument();
  });

  it('says plainly when the text was not recorded, or cannot be read', async () => {
    mockFetchContent.mockResolvedValueOnce({ subject: null, bodyHtml: null, bodyText: null });
    const { user } = render(<EmailContentView emailLogId="log-3" />);
    await user.click(screen.getByRole('button', { name: 'Read this email' }));
    expect(await screen.findByText(/What this email said was not recorded/)).toBeInTheDocument();

    mockFetchContent.mockRejectedValueOnce(new Error('not authorized'));
    const second = render(<EmailContentView emailLogId="log-4" />);
    await second.user.click(second.getAllByRole('button', { name: 'Read this email' })[0]!);
    expect(
      await screen.findByText('What this email said is not available here.')
    ).toBeInTheDocument();
  });
});
