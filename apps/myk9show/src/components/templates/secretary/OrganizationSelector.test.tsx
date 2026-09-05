import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { createMockTemplate } from '@/test/utils/mockData';
import { useTemplateStore } from '@/store/templateStore';
import { OrganizationSelector } from './OrganizationSelector';

const template = createMockTemplate();

async function revealTemplate(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getAllByRole('combobox')[0]);
  await user.click(await screen.findByRole('option', { name: 'AKC' }));
  await user.click(screen.getAllByRole('combobox')[1]);
  await user.click(await screen.findByRole('option', { name: 'Scent Work' }));
}

describe('OrganizationSelector template cards', () => {
  beforeEach(() => {
    useTemplateStore.setState({ templates: [template], isInitialized: true });
  });

  it.each([
    ['pointer', 'click'],
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ] as const)('selects a template by %s and exposes its selected state', async (_label, input) => {
    const onTemplateSelected = vi.fn();
    const view = render(<OrganizationSelector onTemplateSelected={onTemplateSelected} />);
    await revealTemplate(view.user);

    const card = await screen.findByRole('button', { name: `Select ${template.templateName}` });
    if (input === 'click') {
      await view.user.click(card);
    } else {
      card.focus();
      await view.user.keyboard(input);
    }

    expect(onTemplateSelected).toHaveBeenCalledWith(template);
    view.rerender(
      <OrganizationSelector
        onTemplateSelected={onTemplateSelected}
        selectedTemplate={template}
      />
    );
    expect(screen.getByRole('button', { name: `Select ${template.templateName}` })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
