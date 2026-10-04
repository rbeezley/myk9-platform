import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MasterDetailLayout } from '../MasterDetailLayout';
import { useEmbeddedDetail } from '../embeddedDetail';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

function Detail() {
  return <p>{useEmbeddedDetail() ? 'detail:embedded' : 'detail:page'}</p>;
}

const renderLayout = (detail: React.ReactNode) =>
  render(
    <MasterDetailLayout
      id="test"
      listLabel="Test list"
      detailLabel="Test detail"
      list={<p>the list</p>}
      detail={detail}
    />
  );

describe('MasterDetailLayout', () => {
  it('shows only the list, with no panes, when nothing is open', () => {
    mockViewportWidth(1600);
    renderLayout(null);
    expect(screen.getByText('the list')).toBeInTheDocument();
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
  });

  it('shows list and detail side by side at xl, with the detail told it is embedded', () => {
    mockViewportWidth(1280);
    renderLayout(<Detail />);
    expect(screen.getByTestId('master-detail-layout')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Test list' })).toHaveTextContent('the list');
    expect(screen.getByRole('region', { name: 'Test detail' })).toHaveTextContent(
      'detail:embedded'
    );
  });

  it('keeps the page hop below xl: the detail replaces the list and is not embedded', () => {
    mockViewportWidth(1279);
    renderLayout(<Detail />);
    expect(screen.getByText('detail:page')).toBeInTheDocument();
    expect(screen.queryByText('the list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('master-detail-layout')).not.toBeInTheDocument();
  });
});
