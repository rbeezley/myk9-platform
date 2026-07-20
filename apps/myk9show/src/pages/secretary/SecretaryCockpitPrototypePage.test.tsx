import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { COCKPIT_PROTOTYPE_SCENARIOS } from '@/features/show-map/prototype/secretaryCockpitPrototypeData';
import SecretaryCockpitPrototypePage from './SecretaryCockpitPrototypePage';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" role="menuitem" {...props} />
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
  AlertDialogAction: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
  AlertDialogPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogOverlay: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  AlertDialogTrigger: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}));

describe('SecretaryCockpitPrototypePage', () => {
  it('records a Revised Expected Start without replacing Scheduled Start', async () => {
    const { user } = render(<SecretaryCockpitPrototypePage />, {
      initialRoute:
        '/prototype/secretary-cockpit?variant=scent&filter=all&focus=container-novice-a',
    });

    await user.click(
      screen.getByRole('button', {
        name: /Edit revised expected start for Container Novice A/i,
      })
    );
    await user.clear(
      screen.getByLabelText('Revised expected start for Container Novice A')
    );
    await user.type(
      screen.getByLabelText('Revised expected start for Container Novice A'),
      '11:05'
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Save revised expected start for Container Novice A',
      })
    );

    expect(screen.getAllByText('Expected 11:05 AM').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Scheduled 10:30 AM').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Container Novice A · expected 11:05 AM')).toBeInTheDocument();
  });

  it('keeps routine Class work reachable when the Class has no attention item', async () => {
    const { user } = render(<SecretaryCockpitPrototypePage />, {
      initialRoute:
        '/prototype/secretary-cockpit?variant=scent&filter=all&focus=interior-novice-b',
    });

    const focusedClass = screen.getAllByRole('region', {
      name: 'Focused class: Interior Novice B',
    })[0]!;
    expect(within(focusedClass).getByText('Class work')).toBeInTheDocument();
    expect(
      within(focusedClass).getByRole('button', { name: 'Entries & results' })
    ).toBeInTheDocument();
    expect(
      within(focusedClass).getByRole('button', { name: 'Paper score entry' })
    ).toBeInTheDocument();
    expect(within(focusedClass).getByRole('button', { name: 'Run order' })).toBeInTheDocument();

    await user.click(within(focusedClass).getByRole('button', { name: 'Paper score entry' }));

    expect(screen.getByText('Paper Scoring')).toBeInTheDocument();
    expect(
      screen.getByText('/scoring/classes/interior-novice-b/entries?mode=split')
    ).toBeInTheDocument();
  });

  it('routes paper-score entry to the canonical secretary scoring owner', () => {
    const scoringClass = COCKPIT_PROTOTYPE_SCENARIOS.scent.classes.find(
      classItem => classItem.id === 'interior-advanced'
    );

    expect(scoringClass?.primaryAction.destination).toBe(
      '/scoring/classes/interior-advanced/entries?mode=split'
    );
  });

  it('keeps missing paper-score work visible when a secretary marks judging complete', async () => {
    const { user } = render(<SecretaryCockpitPrototypePage />, {
      initialRoute:
        '/prototype/secretary-cockpit?variant=scent&filter=all&focus=interior-advanced',
    });

    const statusControls = screen.getAllByRole('button', {
      name: /Change status for Interior Advanced\. Current status: In progress/i,
    });
    await user.click(statusControls[0]!);
    await user.click(
      within(statusControls[0]!.parentElement!).getByRole('menuitem', { name: 'Complete' })
    );

    expect(await screen.findByText('Mark Interior Advanced complete?')).toBeInTheDocument();
    expect(
      within(screen.getByRole('alertdialog')).getByText(/2 paper scores still need entry/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark complete' }));

    expect(
      screen.getAllByRole('button', {
        name: /Change status for Interior Advanced\. Current status: Complete/i,
      }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('2 paper scores still need entry').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Interior Advanced · class complete · score entry still needed')
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Started 10:07 AM · Finished /).length).toBeGreaterThan(0);
  });

  it('records an actual start time when a paper-scored Class is started manually', async () => {
    const { user } = render(<SecretaryCockpitPrototypePage />, {
      initialRoute:
        '/prototype/secretary-cockpit?variant=scent&filter=all&focus=container-novice-a',
    });

    const statusControl = screen.getAllByRole('button', {
      name: /Change status for Container Novice A\. Current status: Not started/i,
    })[0]!;
    await user.click(
      within(statusControl.parentElement!).getByRole('menuitem', { name: 'In progress' })
    );

    expect(
      screen.getAllByRole('button', {
        name: /Change status for Container Novice A\. Current status: In progress/i,
      }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Started \d{1,2}:\d{2} [AP]M/).length).toBeGreaterThan(0);
  });
});
