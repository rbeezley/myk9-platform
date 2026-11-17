// apps/myk9show/src/test/components/askq/AskQAppHelpContent.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAppHelpContent } from '@/components/askq/AskQAppHelpContent';
import type { SupportHelpState } from '@/features/support/useSupportHelp';

const ESCALATING_STATE: SupportHelpState = {
  status: 'escalating',
  question: 'How do I add a dog to my show entry?',
  route: {
    kind: 'escalate',
    reason: 'low_confidence',
    message: "I couldn't answer that confidently.",
    question: 'How do I add a dog to my show entry?',
  },
  ticket: null,
  error: null,
};

describe('AskQAppHelpContent', () => {
  it('shows the question, the handoff message and the next step to a signed-in user', () => {
    render(<AskQAppHelpContent currentUserId="user-1" state={ESCALATING_STATE} />);

    expect(screen.getByText('How do I add a dog to my show entry?')).toBeInTheDocument();
    expect(screen.getByText("I couldn't answer that confidently.")).toBeInTheDocument();
    expect(screen.getByText(/click Create ticket/)).toBeInTheDocument();
  });

  it('asks a guest to sign in instead', () => {
    render(<AskQAppHelpContent currentUserId={null} state={ESCALATING_STATE} />);

    expect(screen.getByText(/Sign in to create a support ticket/)).toBeInTheDocument();
  });
});
