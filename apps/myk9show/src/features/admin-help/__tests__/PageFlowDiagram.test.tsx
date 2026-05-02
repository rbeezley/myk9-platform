import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import mermaid from 'mermaid';
import { PageFlowDiagram } from '../components/PageFlowDiagram';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

// Mock mermaid — it does DOM manipulation incompatible with jsdom.
// PageFlowDiagram uses dynamic import('mermaid'); vi.mock hoists this mock so
// the dynamic import resolves to the mock object in all tests.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function entry(path: string): PageEntry {
  return {
    path,
    title: path.split('/').filter(Boolean).pop() ?? 'root',
    description: 'test',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'test',
    status: 'working',
  };
}

beforeEach(() => {
  mockNavigate.mockReset();
  delete (window as any).__myk9FlowNav; // clean up between tests
  // Default: resolve immediately so render completes
  vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' });
});

describe('PageFlowDiagram', () => {
  it('shows empty state when pages is empty', () => {
    render(<PageFlowDiagram pages={[]} />);
    expect(screen.getByText(/no pages match/i)).toBeInTheDocument();
  });

  it('shows spinner while mermaid is rendering', () => {
    let rejectFn!: (err: Error) => void;
    vi.mocked(mermaid.render).mockReturnValue(
      new Promise<{ svg: string }>((_resolve, reject) => {
        rejectFn = reject;
      })
    );
    const { unmount } = render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    // Cancel the pending promise by unmounting (triggers cancelled = true cleanup)
    // then reject so the chain settles and doesn't leak
    unmount();
    rejectFn(new Error('test cleanup'));
  });

  it('calls mermaid.render with the graph string', async () => {
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(
        expect.stringContaining('myk9-flow-'),
        expect.stringContaining('flowchart LR')
      );
    });
  });

  it('calls navigate with the correct path when __myk9FlowNav is invoked', async () => {
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());

    // Simulate a Mermaid node click via the global callback
    (window as any).__myk9FlowNav('admin_users');

    expect(mockNavigate).toHaveBeenCalledWith('/admin/users');
  });

  it('shows error message when mermaid.render rejects', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('parse error'));
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to render/i)).toBeInTheDocument();
    });
  });
});
