import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Registration } from '@/types/dog-types';
import { DogInfoTooltip } from './DogInfoTooltip';

const reg = (organization: string, registeredName: string): Registration => ({
  id: registeredName,
  organization,
  registeredName,
  registrationNumber: 'N1',
  breed: 'Beagle',
  status: 'Active',
});

/** MYK9-1207: the tooltip prefers the AKC registration however the organization is stored. */
describe('DogInfoTooltip AKC preference', () => {
  it.each(['AKC', 'AKC (American Kennel Club)'])(
    'shows the AKC registration stored as %s ahead of an earlier UKC one',
    async stored => {
      const { user } = render(
        <DogInfoTooltip
          dogName="Maple"
          registrations={[reg('UKC (United Kennel Club)', 'UCH Maple'), reg(stored, 'CH Maple')]}
        />
      );
      await user.hover(screen.getByText('Maple'));
      expect((await screen.findAllByText('CH Maple')).length).toBeGreaterThan(0);
      expect(screen.queryByText('UCH Maple')).not.toBeInTheDocument();
    }
  );
});
