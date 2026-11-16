import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils/testUtils';
import { LABEL_TEMPLATES } from '@/lib/labels/labelTemplates';
import { LabelSheetStartPicker } from '../LabelSheetStartPicker';

describe('LabelSheetStartPicker (MYK9-2073)', () => {
  it('taps label 5 to skip 4, with 4 labels greyed as used', async () => {
    const onSkipChange = vi.fn();
    const { user } = render(
      <LabelSheetStartPicker
        template={LABEL_TEMPLATES['18262']!}
        skip={0}
        onSkipChange={onSkipChange}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(14);
    await user.click(screen.getByRole('button', { name: 'Start at label 5' }));
    expect(onSkipChange).toHaveBeenCalledWith(4);
  });

  it('greys the labels before the start', () => {
    const { container } = render(
      <LabelSheetStartPicker template={LABEL_TEMPLATES['18262']!} skip={4} onSkipChange={vi.fn()} />
    );
    expect(container.querySelectorAll('[data-used="true"]')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Start at label 5' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
