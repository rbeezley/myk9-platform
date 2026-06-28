import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LabelModeHeader,
  LabelSetupSection,
  SetupEyebrow,
} from '../LabelModeChrome';

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

describe('SetupEyebrow', () => {
  it('renders its children with the shared eyebrow typography', () => {
    render(<SetupEyebrow>Label Size</SetupEyebrow>);
    const eyebrow = screen.getByText('Label Size');
    // The canonical eyebrow type — uppercase, small, muted — shared by every
    // label-setup group heading so they stay visually consistent.
    expect(eyebrow).toHaveClass(
      'text-xs',
      'font-semibold',
      'uppercase',
      'tracking-wide',
      'text-muted-foreground'
    );
  });

  it('merges per-site spacing passed via className', () => {
    // Each group owns the gap to its following control (mb-2 / mb-1 / none),
    // so the spacing is a prop, not baked into the helper.
    render(<SetupEyebrow className="mb-2">Include on Label</SetupEyebrow>);
    const eyebrow = screen.getByText('Include on Label');
    expect(eyebrow).toHaveClass('mb-2', 'text-xs', 'uppercase');
  });
});
