// apps/myk9show/src/test/components/askq/AskQFeedback.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQFeedback } from '@/components/askq/AskQFeedback';
import * as askqService from '@/services/askqService';

vi.mock('@/services/askqService');

describe('AskQFeedback', () => {
  it('renders thumbs up and down buttons', () => {
    render(<AskQFeedback queryLogId="log-1" />);
    expect(screen.getByLabelText('Helpful')).toBeInTheDocument();
    expect(screen.getByLabelText('Not helpful')).toBeInTheDocument();
  });

  it('calls submitFeedback with rating 1 on thumbs up', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Helpful'));

    expect(askqService.submitFeedback).toHaveBeenCalledWith({
      queryLogId: 'log-1',
      rating: 1,
    });
  });

  it('calls submitFeedback with rating -1 on thumbs down', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Not helpful'));

    expect(askqService.submitFeedback).toHaveBeenCalledWith({
      queryLogId: 'log-1',
      rating: -1,
    });
  });

  it('shows report issue link', () => {
    render(<AskQFeedback queryLogId="log-1" />);
    expect(screen.getByText('Report issue')).toBeInTheDocument();
  });

  it('disables buttons after rating', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Helpful'));

    expect(screen.getByLabelText('Helpful')).toBeDisabled();
    expect(screen.getByLabelText('Not helpful')).toBeDisabled();
  });
});
