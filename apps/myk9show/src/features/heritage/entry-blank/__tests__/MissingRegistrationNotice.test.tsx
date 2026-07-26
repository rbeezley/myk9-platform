import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MissingRegistrationNotice } from '../MissingRegistrationNotice';
import { buildEntryBlankProps } from '../buildEntryBlankProps';

const BASE = {
  show: { name: 'Show', start_date: '2026-06-12', end_date: '2026-06-13' },
  trials: [{ id: 't1', date: '2026-06-12', trial_number: 'I', display_order: 1 }],
  classes: [{ id: 'c1', trial_id: 't1', level: 'Novice', element: 'Container', section: 'A' }],
  judges: [{ trial_id: 't1', judgeName: 'J. Judge' }],
  club: { name: 'Club' },
  secretary: { name: 'S. Secretary' },
};

describe('MissingRegistrationNotice', () => {
  it('renders nothing when the dog has a registration for the organization', () => {
    const props = buildEntryBlankProps({
      ...BASE,
      entry: { trial_id: 't1', class_id: 'c1', entry_fee: 25 },
      dog: {
        call_name: 'Tera',
        registrations: [
          {
            id: 'r1',
            organization: 'AKC (American Kennel Club)',
            registration_number: 'DN68759601',
            registered_name: 'Maia TeraByte Van Neerland',
            breed: 'Dutch Shepherd',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    const { container } = render(<MissingRegistrationNotice dog={props.dog} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns the operator when the dog has no registration for the organization', () => {
    const props = buildEntryBlankProps({
      ...BASE,
      entry: { trial_id: 't1', class_id: 'c1', entry_fee: 25 },
      dog: { call_name: 'Rex', registrations: [] },
    });

    render(<MissingRegistrationNotice dog={props.dog} />);

    // role="alert" so it is announced, not just visually present.
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/no registration for this trial/i);
    expect(alert).toHaveTextContent(/print blank/i);
  });

  it('stays silent in blank mode, where no dog was supplied at all', () => {
    const props = buildEntryBlankProps(BASE);
    const { container } = render(<MissingRegistrationNotice dog={props.dog} />);
    expect(container).toBeEmptyDOMElement();
  });
});
