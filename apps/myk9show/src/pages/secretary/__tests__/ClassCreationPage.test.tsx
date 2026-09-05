import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { createMockTemplate } from '@/test/utils/mockData';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useTemplateStore } from '@/store/templateStore';
import { ClassCreationPage } from '../ClassCreationPage';

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
});
