/**
 * MYK9-1036: the Result Catalog's judge + day scope, through the real Reports page. The preview
 * is stubbed to capture the rows the page hands it, so these assert what would print.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import ReportsPage from '../index';

const state = vi.hoisted(() => ({
  dataState: 'ready' as 'ready' | 'loading',
  classes: undefined as unknown[] | undefined,
}));
const seen = vi.hoisted(() => ({ classes: [] as unknown[], entries: [] as unknown[] }));
const toastSpy = vi.hoisted(() => ({ called: vi.fn() }));

vi.mock('sonner', () => {
  const toast = Object.assign((...args: unknown[]) => toastSpy.called(...args), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast, Toaster: () => null };
});

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Fall Trial', startDate: '2026-04-12', endDate: '2026-04-13' },
    isLoading: false,
    isError: false,
    hasData: true,
  }),
}));

const judge = (id: string, first: string, status = 'confirmed') => [
  { id: `a-${id}`, person_id: id, status, people: { first_name: first, last_name: 'Judge' } },
];
const CLASSES = [
  {
    id: 'class-1',
    element: 'Buried',
    level: 'Novice',
    trial_id: 'trial-1',
    judge_assignments: judge('j-pat', 'Pat'),
  },
  {
    id: 'class-2',
    element: 'Interior',
    level: 'Advanced',
    trial_id: 'trial-2',
    judge_assignments: judge('j-sam', 'Sam'),
  },
];

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Fall Trial' },
    trials: [
      { id: 'trial-1', trial_number: 1, date: '2026-04-12' },
      { id: 'trial-2', trial_number: 2, date: '2026-04-13' },
    ],
    classes: state.dataState === 'loading' ? undefined : CLASSES,
    entries: state.dataState === 'loading' ? undefined : [{ id: 'entry-1', class_id: 'class-1' }],
    dataState: state.dataState,
    isReady: state.dataState === 'ready',
    isLoading: state.dataState === 'loading',
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: [], isLoading: false, isError: false, syncFailed: false }),
}));
vi.mock('../reportPreviewUtils', () => ({ printIframe: vi.fn(() => true) }));
vi.mock('../ReportPreview', () => ({
  ReportPreview: (props: { classes?: unknown[]; entries?: unknown[] }) => {
    seen.classes = props.classes ?? [];
    seen.entries = props.entries ?? [];
    return <div data-testid="report-preview">Preview</div>;
  },
}));

const renderPage = (search: string) =>
  render(
    <Routes>
      <Route path="/shows/:showId/reports" element={<ReportsPage />} />
    </Routes>,
    { initialRoute: `/shows/show-1/reports${search}` }
  );
const classIds = () => (seen.classes as Array<{ id: string }>).map(c => c.id);
const picker = () => screen.getByRole('combobox', { name: /judge's day/i });

describe('ReportsPage Result Catalog judge day', () => {
  beforeEach(() => {
    state.dataState = 'ready';
    seen.classes = [];
    seen.entries = [];
    toastSpy.called.mockClear();
  });

  it('hands the preview only the linked judge’s classes, and the picker names that judge', () => {
    renderPage('?report=result-catalog&judgeId=j-sam&day=2026-04-13');

    expect(classIds()).toEqual(['class-2']);
    expect(seen.entries).toEqual([]);
    expect(picker().textContent).toContain('Sam Judge · Mon, Apr 13');
  });

  it('shows every class with All judges', () => {
    renderPage('?report=result-catalog');
    expect(classIds()).toEqual(['class-1', 'class-2']);
    expect(picker().textContent).toContain('All judges');
  });

  it('has no judge picker on another report, and does not filter it', () => {
    renderPage('?report=check-in-sheet&judgeId=j-sam&day=2026-04-13');
    expect(screen.queryByRole('combobox', { name: /judge's day/i })).not.toBeInTheDocument();
    expect(classIds()).toEqual(['class-1', 'class-2']);
  });

  it('says loading, not "not found", while the classes are still loading', () => {
    state.dataState = 'loading';
    renderPage('?report=result-catalog&judgeId=j-sam&day=2026-04-13');

    expect(picker().textContent).toContain('Loading judges…');
    expect(picker().textContent).not.toMatch(/not found/i);
    expect(screen.queryByText(/isn't in this show/)).not.toBeInTheDocument();
  });

  it('once loaded, a judge day that is not in the show prints nothing and refuses Print, inline and in a toast', async () => {
    const user = userEvent.setup();
    renderPage('?report=result-catalog&judgeId=j-nobody&day=2026-04-13');

    expect(classIds()).toEqual([]);
    expect(picker().textContent).toContain('Judge and day not found');
    expect(screen.getByText(/That judge's day isn't in this show/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(toastSpy.called).toHaveBeenCalledWith(
      expect.stringContaining("That judge's day isn't in this show")
    );
  });

  it('tracks no print record for a judge-day catalog (it would stamp the whole show)', async () => {
    const user = userEvent.setup();
    const first = renderPage('?report=result-catalog&judgeId=j-sam&day=2026-04-13');
    expect(screen.queryByTestId('report-print-status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(toastSpy.called).not.toHaveBeenCalled();
    first.unmount();

    // Positive control: a report that IS tracked shows its print status on this same page.
    renderPage('?report=check-in-sheet');
    expect(screen.getByTestId('report-print-status')).toBeInTheDocument();
  });

  it('picking a trial or a class clears the judge day, so the whole selection prints again', async () => {
    const user = userEvent.setup();
    renderPage('?report=result-catalog&judgeId=j-sam&day=2026-04-13');
    expect(classIds()).toEqual(['class-2']);

    await user.click(screen.getByRole('combobox', { name: /^trial$/i }));
    await user.click(await screen.findByRole('option', { name: /2026-04-12/ }));

    expect(picker().textContent).toContain('All judges');
    expect(classIds()).toEqual(['class-1', 'class-2']);
  });
});
