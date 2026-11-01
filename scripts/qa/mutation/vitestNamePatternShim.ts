import type { Plugin } from 'vitest/config';

/**
 * Stryker's vitest runner (9.6.1 and 10.1.1) restricts a mutant run to the
 * tests that cover it with `testNamePattern = new RegExp(names.join('|'))`,
 * where each name is a suite chain joined by a single space. Vitest 4+ matches
 * that pattern against `fullTestName`, which joins the chain with " > ". Any
 * test inside a `describe` therefore matched nothing, every mutant ran zero
 * tests and "survived" (MYK9-1657: placement 0 of 314 killed).
 *
 * Each space in the pattern may stand for either separator.
 */
export function widenTestNamePattern(pattern: RegExp): RegExp {
  return new RegExp(pattern.source.replace(/ /g, '(?: > | )'), pattern.flags);
}

export function vitestNamePatternShim(): Plugin {
  return {
    name: 'myk9-stryker-test-name-pattern',
    configureVitest({ project }) {
      let current: RegExp | undefined = project.config.testNamePattern;
      Object.defineProperty(project.config, 'testNamePattern', {
        configurable: true,
        enumerable: true,
        get: () => current,
        set: (next: RegExp | undefined) => {
          current = next instanceof RegExp ? widenTestNamePattern(next) : next;
        },
      });
    },
  };
}
