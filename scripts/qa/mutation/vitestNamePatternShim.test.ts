import { describe, expect, it } from 'vitest';

import { vitestNamePatternShim } from './vitestNamePatternShim';

type FakeProject = { config: { testNamePattern: RegExp | undefined } };

function applyHook(project: FakeProject): void {
  const plugin = vitestNamePatternShim() as unknown as {
    configureVitest: (ctx: { project: FakeProject }) => void;
  };
  plugin.configureVitest({ project });
}

describe('vitestNamePatternShim', () => {
  it('widens a RegExp assigned after the hook', () => {
    const project: FakeProject = { config: { testNamePattern: undefined } };
    applyHook(project);
    project.config.testNamePattern = /a b/;
    expect(project.config.testNamePattern?.test('a > b')).toBe(true);
    expect(project.config.testNamePattern?.test('a b')).toBe(true);
  });

  it('reads back undefined after assigning undefined', () => {
    const project: FakeProject = { config: { testNamePattern: undefined } };
    applyHook(project);
    project.config.testNamePattern = /a b/;
    project.config.testNamePattern = undefined;
    expect(project.config.testNamePattern).toBeUndefined();
  });

  it('preserves a pattern set before the hook as-is', () => {
    const before = /a b/;
    const project: FakeProject = { config: { testNamePattern: before } };
    applyHook(project);
    expect(project.config.testNamePattern).toBe(before);
  });
});
