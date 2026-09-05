import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useWizardStore } from '@/store/wizardStore';
import { createMockTemplate } from '@/test/utils/mockData';
import { ClassSelectionStep } from '../ClassSelectionStep';
import { ReviewStep } from '../ReviewStep';

const template = createMockTemplate();
const alternateTemplate = {
  ...createMockTemplate(),
  id: 'alternate-template',
  templateName: 'Alternate AKC template',
};
let availableTemplates = [template];

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: availableTemplates,
    isLoading: availableTemplates.length === 0,
    isInitialized: availableTemplates.length > 0,
  }),
}));
vi.mock('@/services/sportTemplateService', () => ({ prewarmClassRulesCache: vi.fn() }));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripeAccount: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useResolvePersonName', () => ({
  useResolvePersonName: () => (id: string) => `Person ${id}`,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ clubs: [{ id: 'club-1', name: 'Test Club' }] }),
}));

describe('ClassSelectionStep retained cloned classes', () => {
  beforeEach(() => {
    availableTemplates = [template];
    useWizardStore.getState().resetWizard();
    useWizardStore.setState(state => ({
      show: {
        ...state.show,
        name: 'Cloned Show',
        organization: 'AKC',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        location: 'Fairgrounds',
        clubId: 'club-1',
        entryOpenDate: '2026-09-01',
        entryCloseDate: '2026-09-25',
        judgeIds: ['judge-1', 'judge-2'],
        officials: { chairman: ['chair-1'], secretary: ['secretary-1'], steward: [] },
      },
      judgeDetails: {
        'judge-1': { name: 'Judge One', email: '', phone: '' },
        'judge-2': { name: 'Judge Two', email: '', phone: '' },
      },
      judgeAssignments: {
        'Renamed Container Special': 'judge-1',
        'Buried Advanced': 'judge-2',
      },
      trials: [
        {
          id: 'trial-1',
          name: 'Saturday Trial',
          dateTime: '2026-10-01T08:00:00.000Z',
          eventNumber: 'SW-1',
          trialType: 'Scent Work',
          classes: [
            {
              templateId: template.id,
              customizations: {
                className: 'Renamed Container Special',
                element: 'Container',
                level: 'Excellent',
                section: 'B',
                displayOrder: 9,
                timeLimitSeconds: 75,
              },
              judgeId: 'judge-1',
            },
            {
              templateId: template.id,
              customizations: {
                ...template.classDefinitions[1],
                timeLimitSeconds: 120,
              },
              judgeId: 'judge-2',
            },
          ],
        },
      ],
    }));
  });

  it('keeps a renamed clone searchable and removable, then updates Review counts and assignments', async () => {
    const classes = render(<ClassSelectionStep />);

    await classes.user.type(screen.getByPlaceholderText('Search classes...'), 'Renamed Container');
    await classes.user.click(
      await screen.findByRole('checkbox', { name: 'Deselect Renamed Container Special' })
    );

    const remaining = useWizardStore.getState().trials[0]?.classes ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toEqual(
      expect.objectContaining({
        judgeId: 'judge-2',
        customizations: expect.objectContaining({ timeLimitSeconds: 120 }),
      })
    );

    classes.unmount();
    render(<ReviewStep />);

    const classesTile = screen.getByText(/^Classes$/, { selector: 'p' }).closest('div') as HTMLElement;
    expect(within(classesTile).getByText('1')).toBeInTheDocument();
    const judgesTile = screen.getByText(/classes with a judge/i).closest('div') as HTMLElement;
    expect(within(judgesTile).getByText('1')).toBeInTheDocument();
    expect(within(judgesTile).getByText('/1')).toBeInTheDocument();
  });

  it('hydrates an asynchronously loaded saved template without clearing retained classes', async () => {
    availableTemplates = [];
    const classes = render(<ClassSelectionStep />);

    availableTemplates = [template, alternateTemplate];
    classes.rerender(<ClassSelectionStep />);

    await classes.user.type(screen.getByPlaceholderText('Search classes...'), 'Renamed Container');
    expect(
      await screen.findByRole('checkbox', { name: 'Deselect Renamed Container Special' })
    ).toBeChecked();
    expect(useWizardStore.getState().trials[0]?.classes).toHaveLength(2);
  });
});
