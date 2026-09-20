import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { createMockTemplate } from '@/test/utils/mockData';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useTemplateStore } from '@/store/templateStore';
import type { ClassDefinition } from '@/types/template.types';
import { ClassCreationPage } from '../ClassCreationPage';

const mockClassStoreState = vi.hoisted(() => ({
  classes: [] as Array<{
    id: string;
    trialId: string;
    className?: string;
    element?: string;
    level?: string;
    section?: string;
  }>,
  entries: [] as Array<{
    classId: string;
    status?: string;
    entryStatus?: string;
    checkInStatus?: string;
  }>,
  isLoading: false,
  isFetching: false,
  isStale: false,
  isEntriesVerified: true,
  error: null as string | null,
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => mockClassStoreState,
}));

vi.mock('@/hooks/useTrialDetailData', () => ({
  useTrialDetailData: () => ({ parentShow: { id: 'show-1' } }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'secretary-1' } }),
}));

const template = createMockTemplate();

async function chooseTemplate(
  user: ReturnType<typeof render>['user'],
  activation: 'pointer' | 'Space' = 'pointer'
) {
  await user.click(screen.getAllByRole('combobox')[0]);
  await user.click(await screen.findByRole('option', { name: 'AKC' }));
  await user.click(screen.getAllByRole('combobox')[1]);
  await user.click(await screen.findByRole('option', { name: 'Scent Work' }));
  const card = await screen.findByRole('button', { name: `Select ${template.templateName}` });
  if (activation === 'pointer') {
    await user.click(card);
  } else {
    card.focus();
    await user.keyboard(' ');
  }
}

describe('ClassCreationPage', () => {
  beforeEach(() => {
    useClassCreationStore.getState().resetCreation();
    useTemplateStore.setState({ templates: [template], isInitialized: true });
    mockClassStoreState.classes = [];
    mockClassStoreState.entries = [];
    mockClassStoreState.isLoading = false;
    mockClassStoreState.isFetching = false;
    mockClassStoreState.isStale = false;
    mockClassStoreState.isEntriesVerified = true;
    mockClassStoreState.error = null;
  });

  it('selects a template in the browser path and advances beyond Step 1', async () => {
    const { user } = render(<ClassCreationPage trialId="trial-1" />);

    await chooseTemplate(user);
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Choose Classes')).toHaveClass('text-foreground');
    expect(screen.getByText(`Select Classes for ${template.templateName}`)).toBeInTheDocument();
  });

  it('selects a class and reaches Set Values and Review with the selected count', async () => {
    const { user } = render(<ClassCreationPage trialId="trial-1" />);

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Container Novice A'));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Set Values')).toHaveClass('text-foreground');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Review & Create')).toHaveClass('text-foreground');
    expect(screen.getByText('Selected Classes (1)')).toBeInTheDocument();
  });

  it('hides the review judge-time estimate when current entry counts are zero', async () => {
    const { user } = render(<ClassCreationPage trialId="trial-1" />);

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Container Novice A'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Review & Create')).toHaveClass('text-foreground');
    expect(
      screen.queryByText(/estimated judging time based on current entries/i)
    ).not.toBeInTheDocument();
  });

  it('uses current counts only to gate the unchanged review judge-time estimate', async () => {
    const selectedClass = template.classDefinitions[0]!;
    mockClassStoreState.classes = [
      {
        id: 'class-1',
        trialId: 'trial-1',
        className: selectedClass.className,
        element: selectedClass.element,
        level: selectedClass.level,
        section: selectedClass.section,
      },
      {
        id: 'class-2',
        trialId: 'trial-1',
        className: 'Unrelated Class',
        element: 'Interior',
        level: 'Advanced',
        section: 'B',
      },
    ];
    mockClassStoreState.entries = [
      { classId: 'class-1', status: 'Qualified' },
      { classId: 'class-1', status: 'Qualified' },
      { classId: 'class-1', status: 'Withdrawn' },
      { classId: 'class-2', status: 'Qualified' },
      { classId: 'class-2', status: 'Qualified' },
      { classId: 'class-2', status: 'Qualified' },
    ];

    const view = render(<ClassCreationPage trialId="trial-1" />);
    const { user } = view;

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Container Novice A'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(
      screen.getByText(/estimated judging time based on current entries/i)
    ).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    mockClassStoreState.entries = [{ classId: 'class-1', status: 'Qualified' }];
    view.rerender(<ClassCreationPage trialId="trial-1" />);

    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('hides the estimate when cached entry counts become stale', async () => {
    const selectedClass = template.classDefinitions[0]!;
    mockClassStoreState.classes = [
      {
        id: 'class-1',
        trialId: 'trial-1',
        className: selectedClass.className,
        element: selectedClass.element,
        level: selectedClass.level,
        section: selectedClass.section,
      },
    ];
    mockClassStoreState.entries = [{ classId: 'class-1', status: 'Qualified' }];

    const view = render(<ClassCreationPage trialId="trial-1" />);
    const { user } = view;

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Container Novice A'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/estimated judging time based on current entries/i)).toBeInTheDocument();

    mockClassStoreState.isStale = true;
    view.rerender(<ClassCreationPage trialId="trial-1" />);

    expect(
      screen.queryByText(/estimated judging time based on current entries/i)
    ).not.toBeInTheDocument();
  });

  it.each([
    ['moved', { entryStatus: 'moved' }],
    ['scratched', { entryStatus: 'scratched' }],
    ['not accepted', { entryStatus: 'not_accepted' }],
    ['absent', { entryStatus: 'absent' }],
    ['pulled', { entryStatus: 'accepted', checkInStatus: 'pulled' }],
  ] as const)('hides review judge time for %s entries', async (_label, lifecycle) => {
    const selectedClass = template.classDefinitions[0]!;
    mockClassStoreState.classes = [
      {
        id: 'class-1',
        trialId: 'trial-1',
        className: selectedClass.className,
        element: selectedClass.element,
        level: selectedClass.level,
        section: selectedClass.section,
      },
    ];
    mockClassStoreState.entries = [{ classId: 'class-1', ...lifecycle }];

    const { user } = render(<ClassCreationPage trialId="trial-1" />);

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByText('Container Novice A'));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(
      screen.queryByText(/estimated judging time based on current entries/i)
    ).not.toBeInTheDocument();
  });

  it('matches optional template fields to database-normalized empty strings', async () => {
    const selectedClass: ClassDefinition = {
      className: 'Detective',
      element: 'Detective',
      displayOrder: 99,
    };
    useTemplateStore.setState({
      templates: [
        {
          ...template,
          classDefinitions: [...template.classDefinitions, selectedClass],
        },
      ],
      isInitialized: true,
    });
    mockClassStoreState.classes = [
      {
        id: 'class-optional-fields',
        trialId: 'trial-1',
        className: selectedClass.className,
        element: selectedClass.element,
        level: '',
        section: '',
      },
    ];
    mockClassStoreState.entries = [{ classId: 'class-optional-fields', status: 'Qualified' }];

    const { user } = render(<ClassCreationPage trialId="trial-1" />);

    await chooseTemplate(user, 'Space');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('heading', { name: selectedClass.className, level: 4 }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(
      screen.getByText(/estimated judging time based on current entries/i)
    ).toBeInTheDocument();
  });
});
