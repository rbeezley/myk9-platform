import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { MaxTimeNotSetNotice } from './MaxTimeNotSetNotice';

describe('MaxTimeNotSetNotice', () => {
  it('warns on a sheet that times to the class max when the class has none', () => {
    render(<MaxTimeNotSetNotice maxTimeSeconds={0} registryKey="AKC_SCENT_WORK" />);
    expect(screen.getByRole('note')).toHaveTextContent(/won.t stop on its own/i);
  });

  it('stays silent when the class has a max time', () => {
    render(<MaxTimeNotSetNotice maxTimeSeconds={180} registryKey="AKC_SCENT_WORK" />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('stays silent on sheets with their own fixed limit or none (FastCat, Rally, Obedience)', () => {
    for (const key of ['AKC_FASTCAT', 'UKC_RALLY', 'UKC_OBEDIENCE']) {
      const { unmount } = render(<MaxTimeNotSetNotice maxTimeSeconds={0} registryKey={key} />);
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      unmount();
    }
  });
});
