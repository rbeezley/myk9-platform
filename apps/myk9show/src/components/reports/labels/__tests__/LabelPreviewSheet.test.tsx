import { render, screen } from '@testing-library/react';
import { LabelPreviewSheet } from '../LabelPreviewSheet';
import { LABEL_TEMPLATES, DEFAULT_TEMPLATE_ID } from '@/lib/labels/labelTemplates';

const template = LABEL_TEMPLATES[DEFAULT_TEMPLATE_ID]!;

describe('LabelPreviewSheet', () => {
  it('pins page and cells to paper colours and renders items only in item cells', () => {
    render(
      <LabelPreviewSheet
        page={{
          pageNumber: 1,
          cells: [
            { type: 'item', item: 'Storm', index: 0 },
            { type: 'skip', index: 1 },
          ],
        }}
        template={template}
        renderItem={item => <span>{item}</span>}
      />
    );
    expect(screen.getByText('Storm')).toBeInTheDocument();
    const cells = screen.getAllByTestId('label-preview-cell');
    expect(cells).toHaveLength(2);
    for (const el of [...cells, screen.getByTestId('label-preview-page')]) {
      expect(el).toHaveStyle({ backgroundColor: '#fff', color: '#000' });
    }
  });
});
