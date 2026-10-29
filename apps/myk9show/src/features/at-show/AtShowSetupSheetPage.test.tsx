import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@/test/utils/testUtils';
import type { AtShowClassGroup } from './atShowClassListAdapter';
import { AtShowSetupSheetLink } from './AtShowSetupSheetLink';
import { AtShowSetupSheetPage } from './AtShowSetupSheetPage';
import { atShowSetupSheetPath, setupSheetRegistryIds } from './setupSheetRegistries';

const classList = vi.hoisted(() => ({
  groups: [] as unknown[],
  isLoading: false,
  error: null as Error | null,
  refresh: vi.fn(),
}));

vi.mock('./useAtShowClassList', () => ({
  useAtShowClassList: () => ({
    groups: classList.groups,
    isLoading: classList.isLoading,
    error: classList.error,
    refresh: classList.refresh,
  }),
}));

function groupsFor(...registries: Array<string | null>): AtShowClassGroup[] {
  return registries.map((registry, i) => ({
    trial: { id: `trial-${i}`, registry_id: registry },
    classes: [],
    nextUpByClassId: new Map(),
  })) as unknown as AtShowClassGroup[];
}

function renderPage() {
  return render(
    <Routes>
      <Route path="/at-show/:showId/setup-sheet" element={<AtShowSetupSheetPage />} />
    </Routes>,
    { initialRoute: '/at-show/show-1/setup-sheet' }
  );
}

beforeEach(() => {
  classList.groups = [];
  classList.isLoading = false;
  classList.error = null;
  classList.refresh.mockReset();
});

describe('setupSheetRegistryIds', () => {
  it('lists UKC and AKC once each and drops ASCA', () => {
    expect(setupSheetRegistryIds(groupsFor('UKC', 'ASCA', 'UKC', 'AKC'))).toEqual(['UKC', 'AKC']);
    expect(setupSheetRegistryIds(groupsFor('ASCA'))).toEqual([]);
  });
});

describe('AtShowSetupSheetLink', () => {
  it('links a UKC or AKC show to the at-show setup sheet route', () => {
    render(
      <AtShowSetupSheetLink showId="show-1" groups={groupsFor('UKC')} isExhibitorOnly={false} />
    );

    expect(screen.getByRole('link', { name: /judge setup cheat sheet/i })).toHaveAttribute(
      'href',
      atShowSetupSheetPath('show-1')
    );
  });

  it('renders nothing for an ASCA-only show', () => {
    render(
      <AtShowSetupSheetLink showId="show-1" groups={groupsFor('ASCA')} isExhibitorOnly={false} />
    );

    expect(screen.queryByRole('link', { name: /setup cheat sheet/i })).not.toBeInTheDocument();
  });
});

describe('AtShowSetupSheetLink for exhibitors', () => {
  it('renders nothing for an exhibitor-only account', () => {
    render(<AtShowSetupSheetLink showId="show-1" groups={groupsFor('UKC')} isExhibitorOnly />);

    expect(screen.queryByRole('link', { name: /setup cheat sheet/i })).not.toBeInTheDocument();
  });
});

describe('AtShowSetupSheetPage', () => {
  it('says the show could not be loaded, with a retry, when the class list fails', async () => {
    classList.error = new Error('IndexedDB read failed');
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/couldn.t load this show.s trials/i);
    expect(screen.queryByText(/no setup cheat sheet/i)).not.toBeInTheDocument();
    screen.getByRole('button', { name: /try again/i }).click();
    expect(classList.refresh).toHaveBeenCalledTimes(1);
  });

  it('prints the UKC sheet for a UKC show, with a Print button and a way back', () => {
    classList.groups = groupsFor('UKC');
    renderPage();

    expect(screen.getByTestId('setup-table-vehicles-containers')).toBeInTheDocument();
    expect(screen.getByTestId('setup-table-interior-exterior')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-table-handler-discrimination')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to classes/i })).toHaveAttribute(
      'href',
      '/at-show/show-1'
    );
  });

  it('prints the AKC sheet, including Handler Discrimination, for an AKC show', () => {
    classList.groups = groupsFor('AKC');
    renderPage();

    const hd = screen.getByTestId('setup-table-handler-discrimination');
    expect(within(hd).getByText('Hide height')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-table-vehicles-containers')).not.toBeInTheDocument();
  });

  it('prints the sheet alone through a frame, never the app window with its banners', async () => {
    classList.groups = groupsFor('UKC');
    const windowPrint = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();

    const frame = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Setup cheat sheet for printing"]'
    );
    expect(frame).not.toBeNull();
    const framePrint = vi.fn();
    Object.defineProperty(frame!.contentWindow!, 'print', { value: framePrint });

    screen.getByRole('button', { name: 'Print' }).click();

    await vi.waitFor(() => expect(framePrint).toHaveBeenCalledTimes(1));
    expect(windowPrint).not.toHaveBeenCalled();
    const printed = frame!.contentDocument!;
    expect(printed.querySelector('[data-testid="setup-table-vehicles-containers"]')).not.toBeNull();
    expect(printed.querySelector('[data-testid="setup-table-interior-exterior"]')).not.toBeNull();
    // Only the sheet: no toolbar, no app shell.
    expect(printed.body.textContent).not.toMatch(/Back to classes|Announcements/);
    windowPrint.mockRestore();
  });

  it('says there is no sheet for an ASCA show and offers no Print button', () => {
    classList.groups = groupsFor('ASCA');
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(/no setup cheat sheet/i);
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  });
});
