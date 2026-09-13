import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import { OfferedClassesSection } from '../OfferedClassesSection';

const classInfo = (overrides: Partial<ClassInfo> = {}): ClassInfo => ({
  id: 'class-1',
  name: 'Interior Novice',
  element: 'Interior',
  level: 'Novice',
  section: '',
  judgeName: 'Private Judge',
  trialId: 'trial-1',
  time: '',
  ring: 0,
  status: 'Scheduled',
  entryCount: null,
  userHasEntry: false,
  trialName: 'Friday Trial',
  ...overrides,
});

describe('OfferedClassesSection', () => {
  it('shows offered class identity without entry or handler data', () => {
    render(<OfferedClassesSection classes={[classInfo()]} />);

    expect(screen.getByRole('region', { name: 'Offered classes' })).toBeInTheDocument();
    expect(screen.getByText('Interior Novice')).toBeInTheDocument();
    expect(screen.queryByText('Private Judge')).not.toBeInTheDocument();
    expect(screen.queryByText(/handler/i)).not.toBeInTheDocument();
  });
});
