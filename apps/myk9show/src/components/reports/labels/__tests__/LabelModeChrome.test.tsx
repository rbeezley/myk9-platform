import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LabelModeHeader, LabelSetupSection } from '../LabelModeChrome';

describe('LabelModeHeader', () => {
  it('renders the mode title as a heading and the subtitle as supporting copy', () => {
    render(
      <LabelModeHeader
        title="Print Labels — Armband"
        subtitle="Choose a label size, pick which armbands to print, then Print."
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Print Labels — Armband' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choose a label size, pick which armbands to print, then Print.')
    ).toBeInTheDocument();
  });
});

describe('LabelSetupSection', () => {
  it('groups children under an accessible "Label setup" region', () => {
    render(
      <LabelSetupSection>
        <span>config controls</span>
      </LabelSetupSection>
    );
    // The aria-label makes the dense config panel read as one deliberate group,
    // so the mode switch isn't mistaken for a glitch.
    const region = screen.getByRole('region', { name: 'Label setup' });
    expect(region).toBeInTheDocument();
    expect(region).toContainElement(screen.getByText('config controls'));
  });

  it('shows the visible "Label setup" eyebrow label', () => {
    render(
      <LabelSetupSection>
        <span>config controls</span>
      </LabelSetupSection>
    );
    expect(screen.getByText('Label setup')).toBeInTheDocument();
  });
});
