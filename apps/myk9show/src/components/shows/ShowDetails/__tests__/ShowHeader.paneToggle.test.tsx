import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowsPaneToggleProvider } from '@/components/layout/showsPaneToggle';
import { ShowHeader } from '../ShowHeader';

/** MYK9-1989: the folded Shows list's button sits beside the show's name, not on a row above it. */
describe('ShowHeader beside a folded Shows list', () => {
  const header = (
    <ShowHeader
      name="Spring Scent Trial"
      entryCount={5}
      controls={<span>All changes saved</span>}
    />
  );

  it('claims the Shows button and renders it ahead of the name, in the header row', () => {
    const release = vi.fn();
    const claim = vi.fn(() => release);
    const { unmount } = render(
      <ShowsPaneToggleProvider value={{ toggle: <button type="button">Shows</button>, claim }}>
        {header}
      </ShowsPaneToggleProvider>
    );
    const shows = screen.getByRole('button', { name: 'Shows' });
    const name = screen.getByRole('heading', { level: 1, name: 'Spring Scent Trial' });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(shows.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One row: the button's wrapper is a direct child of the header, beside the name's block.
    expect(shows.parentElement?.parentElement).toBe(
      name.closest('div')?.parentElement?.parentElement
    );
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('renders no button outside the Shows pane, or while the list is open', () => {
    render(header);
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
    render(
      <ShowsPaneToggleProvider value={{ toggle: null, claim: () => () => undefined }}>
        {header}
      </ShowsPaneToggleProvider>
    );
    expect(screen.queryByRole('button', { name: 'Shows' })).not.toBeInTheDocument();
  });
});
