// apps/myk9show/src/test/components/askq/AskQAppHelpContent.test.tsx
import { fireEvent, screen } from '@testing-library/react';
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

  // Codex P2 on MYK9-851: App Help is the panel's default mode, so its
  // answers need the same sender mark and the same Found it moment.
  describe('Found it (MYK9-851)', () => {
    const ANSWERED_STATE: SupportHelpState = {
      ...STREAMING_STATE,
      status: 'answered',
      answer: 'Open Entries, then Add Entry.',
      route: {
        kind: 'answer',
        answer: 'Open Entries, then Add Entry.',
        deepLink: null,
        sources: {},
      },
    };

    function content(state: SupportHelpState) {
      return <AskQAppHelpContent currentUserId={null} onEscalate={() => {}} state={state} />;
    }

    it('plays once when an answer lands, then shows the face beside it', () => {
      const view = render(content(STREAMING_STATE));
      view.rerender(content(ANSWERED_STATE));

      expect(screen.getByText('Open Entries, then Add Entry.')).toBeInTheDocument();
      expect(screen.getByTestId('tera-found-it')).toBeInTheDocument();
      fireEvent.ended(view.container.querySelector('video') as HTMLVideoElement);
      expect(screen.getByTestId('tera-face')).toBeInTheDocument();
    });

    it('does not play when the question escalates instead of being answered', () => {
      const view = render(content(STREAMING_STATE));
      view.rerender(
        content({
          ...STREAMING_STATE,
          status: 'escalating',
          route: {
            kind: 'escalate',
            reason: 'low_confidence',
            message: "I couldn't answer that confidently.",
            question: STREAMING_STATE.question,
          },
        })
      );
      expect(screen.queryByTestId('tera-found-it')).toBeNull();
    });
  });
});
