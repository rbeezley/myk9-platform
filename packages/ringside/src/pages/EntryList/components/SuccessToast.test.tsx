import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuccessToast } from './SuccessToast';

const MESSAGE = 'Run order updated successfully';

describe('SuccessToast', () => {
  it('renders the message text', () => {
    const { getByText } = render(
      <SuccessToast isVisible message={MESSAGE} />
    );
    expect(getByText(MESSAGE)).toBeTruthy();
  });

  it('is shown (data-visible=true, opacity-100) when isVisible', () => {
    const { container } = render(<SuccessToast isVisible message={MESSAGE} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-visible')).toBe('true');
    expect(el.getAttribute('aria-hidden')).toBe('false');
    expect(el.className).toContain('opacity-100');
    expect(el.className).toContain('translate-y-0');
  });

  it('stays mounted but hidden (invisible, opacity-0) when not visible, so it can animate out', () => {
    const { container } = render(
      <SuccessToast isVisible={false} message={MESSAGE} />
    );
    const el = container.firstElementChild as HTMLElement;
    // still in the DOM (not conditionally unmounted) so the exit transition runs
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-visible')).toBe('false');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain('opacity-0');
    // NOT `invisible` — visibility can't be transitioned, so the fade-out would
    // snap. Inertness comes from the always-on pointer-events-none + aria-hidden.
    expect(el.className).not.toContain('invisible');
    expect(el.className).toContain('pointer-events-none');
  });

  it('uses the shared motion tokens and gates on reduced motion', () => {
    const { container } = render(<SuccessToast isVisible message={MESSAGE} />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('duration-enter');
    expect(cls).toContain('ease-enter');
    expect(cls).toContain('motion-reduce:transition-none');
  });
});
