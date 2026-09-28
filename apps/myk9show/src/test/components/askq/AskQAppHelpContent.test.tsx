// apps/myk9show/src/test/components/askq/AskQAppHelpContent.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAppHelpContent } from '@/components/askq/AskQAppHelpContent';
import { TERA_WORKING_COPY } from '@/components/askq/askq-config';
import type { SupportHelpState } from '@/features/support/useSupportHelp';

const STREAMING_STATE: SupportHelpState = {
  status: 'streaming',
  question: 'How do I add a dog to my show entry?',
  answer: '',
  toolsUsed: [],
  sources: {},
  route: null,
  ticket: null,
  error: null,
};

describe('AskQAppHelpContent', () => {
  it("shows Tera's working state and copy while streaming with no answer yet", () => {
    render(
      <AskQAppHelpContent currentUserId={null} onEscalate={() => {}} state={STREAMING_STATE} />
    );

    const status = screen.getByRole('status', { name: TERA_WORKING_COPY });
    expect(status).toBeInTheDocument();
    expect(screen.getByText(TERA_WORKING_COPY)).toBeInTheDocument();
    expect(status.querySelector('video[poster*="tera-working"]')).toBeInTheDocument();
    expect(screen.queryByTestId('answer-skeleton')).not.toBeInTheDocument();
  });
});
