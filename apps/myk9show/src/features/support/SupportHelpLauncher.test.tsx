import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SupportHelpLauncher } from './SupportHelpLauncher';
import type { SupportHelpState } from './useSupportHelp';

const authState = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' },
  userWithRoles: { roles: ['exhibitor'], scopes: [], permissions: [] },
}));

const helpState = vi.hoisted(() => ({
  current: {
    state: {
      status: 'idle',
      question: '',
      answer: '',
      toolsUsed: [],
      sources: {},
      route: null,
      ticket: null,
      error: null,
    } as SupportHelpState,
    askForHelp: vi.fn(),
    startEscalation: vi.fn(),
    createTicket: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

vi.mock('./useSupportHelp', () => ({
  useSupportHelp: () => helpState.current,
}));

describe('SupportHelpLauncher', () => {
  beforeEach(() => {
    authState.user = { id: '11111111-1111-4111-8111-111111111111' };
    helpState.current = {
      state: {
        status: 'idle',
        question: '',
        answer: '',
        toolsUsed: [],
        sources: {},
        route: null,
        ticket: null,
        error: null,
      },
      askForHelp: vi.fn(),
      startEscalation: vi.fn(),
      createTicket: vi.fn(),
      reset: vi.fn(),
    };
  });

  it('shows the launcher only for authenticated users', () => {
    const { rerender } = render(<SupportHelpLauncher />);
    expect(screen.getByRole('button', { name: 'Get Help' })).toBeInTheDocument();

    authState.user = null as never;
    rerender(<SupportHelpLauncher />);
    expect(screen.queryByRole('button', { name: 'Get Help' })).not.toBeInTheDocument();
  });

  it('renders a grounded answer with a deep link', async () => {
    helpState.current.state = {
      status: 'answered',
      question: 'Where is my armband number?',
      answer: 'Open My Entries to see your armband number.',
      toolsUsed: ['search_user_guide'],
      sources: { guide: [{ title: 'Armbands' }] },
      route: {
        kind: 'answer',
        answer: 'Open My Entries to see your armband number.',
        deepLink: { label: 'My Entries', href: '/exhibitor/entries' },
        sources: { guide: [{ title: 'Armbands' }] },
      },
      ticket: null,
      error: null,
    };

    render(<SupportHelpLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Get Help' }));

    expect(screen.getByText('Open My Entries to see your armband number.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My Entries/i })).toHaveAttribute(
      'href',
      '/exhibitor/entries'
    );
  });

  it('carries the question into the escalation form', async () => {
    helpState.current.state = {
      status: 'escalating',
      question: 'Can I get a refund?',
      answer: '',
      toolsUsed: [],
      sources: {},
      route: {
        kind: 'escalate',
        reason: 'payment_or_refund',
        message: 'Payment and refund questions need human review.',
        question: 'Can I get a refund?',
      },
      ticket: null,
      error: null,
    };

    render(<SupportHelpLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Get Help' }));

    expect(screen.getByText('Payment and refund questions need human review.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Support request')).toHaveValue('Can I get a refund?');
    });
    expect(screen.getByRole('button', { name: /Create ticket/i })).toBeEnabled();
  });
});
