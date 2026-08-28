import { describe, it, expect } from 'vitest';
import { buildContextualNavigationCommands } from '../contextualCommands';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getClassManagementHref } from '@/components/classes/classManagementFilters';
import type { CommandMenuContext } from '../commandMenuTypes';

function baseCtx(overrides: Partial<CommandMenuContext> = {}): CommandMenuContext {
  return {
    surface: 'entry-management',
    showId: 'show-1',
    ...overrides,
  };
}

describe('buildContextualNavigationCommands', () => {
  it('is empty when no context is registered', () => {
    expect(buildContextualNavigationCommands(null)).toEqual([]);
  });

  it('emits the four Entry Management preset links with exact canonical hrefs', () => {
    const commands = buildContextualNavigationCommands(baseCtx());

    const byId = new Map(commands.map(cmd => [cmd.id, cmd]));
    expect(byId.get('command-menu-entry-management-needs-review')?.href).toBe(
      getEntryManagementHref({ showId: 'show-1', attention: 'pending', mode: 'review' })
    );
    expect(byId.get('command-menu-entry-management-payment-due')?.href).toBe(
      getEntryManagementHref({
        showId: 'show-1',
        attention: 'accepted',
        payment: 'pending',
        mode: 'review',
      })
    );
    expect(byId.get('command-menu-entry-management-needs-check-in')?.href).toBe(
      getEntryManagementHref({ showId: 'show-1', attention: 'accepted', mode: 'day-of' })
    );
    expect(byId.get('command-menu-entry-management-all-entries')?.href).toBe(
      getEntryManagementHref({ showId: 'show-1', mode: 'review' })
    );
  });

  it('carries the trial scope into Entry Management hrefs when a trial is selected', () => {
    const commands = buildContextualNavigationCommands(baseCtx({ trialId: 'trial-1' }));
    const needsReview = commands.find(
      cmd => cmd.id === 'command-menu-entry-management-needs-review'
    );
    expect(needsReview?.href).toBe(
      getEntryManagementHref({
        showId: 'show-1',
        trialId: 'trial-1',
        attention: 'pending',
        mode: 'review',
      })
    );
  });

  it('omits Class Management commands when the context has no trialId', () => {
    const commands = buildContextualNavigationCommands(baseCtx());
    expect(commands.some(cmd => cmd.id.includes('class-management'))).toBe(false);
  });

  it('includes the Class Management link with the canonical href when a trial is selected', () => {
    const commands = buildContextualNavigationCommands(baseCtx({ trialId: 'trial-1' }));
    const classMgmt = commands.find(cmd => cmd.id === 'command-menu-class-management-current-trial');
    expect(classMgmt?.href).toBe(getClassManagementHref({ showId: 'show-1', trialId: 'trial-1' }));
  });

  it('labels every contextual command with the registered show scope', () => {
    const commands = buildContextualNavigationCommands(baseCtx({ trialId: 'trial-1' }));
    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) {
      expect(cmd.showScope).toBe('show-1');
      expect(cmd.sublabel).toBe('Current show');
    }
  });

  it('emits only navigation commands — no runnable mutations', () => {
    const commands = buildContextualNavigationCommands(baseCtx({ trialId: 'trial-1' }));
    for (const cmd of commands) {
      expect(cmd.run).toBeUndefined();
      expect(cmd.href).toBeTruthy();
    }
  });

  it('stays a small fixed set (bounded, no cap machinery needed)', () => {
    const commands = buildContextualNavigationCommands(baseCtx({ trialId: 'trial-1' }));
    expect(commands.length).toBeLessThanOrEqual(8);
  });
});
