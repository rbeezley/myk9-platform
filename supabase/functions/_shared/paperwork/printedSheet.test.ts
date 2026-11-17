// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type {
  EmergencyPacketClass,
  EmergencyPacketTrial,
  PacketReportEntry,
} from '../trialPacket/renderer/types.ts';
import { buildSheetDescriptorFromPrinted } from './printedSheet.ts';

// MYK9-2103: the fingerprint is the printed text, so a printed fact moves it and an unprinted one
// does not. The renderer-backed "iff" proof lives in the app (printedSheetFingerprint.iff.test.ts).
const trials: EmergencyPacketTrial[] = [
  { id: 't1', date: '2026-12-07', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
  { id: 't2', date: '2026-12-08', name: 'Trial 2', trialNumber: '2', registryId: 'UKC' },
];

function classOf(id: string, trialId: string, patch: Partial<EmergencyPacketClass> = {}) {
  return {
    id,
    trialId,
    name: 'Container Novice',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    classNumber: null,
    displayOrder: 1,
    judgeName: 'Judge One',
    ringLabel: null,
    startTime: null,
    timeLimitSeconds: 180,
    timeLimitArea2Seconds: null,
    timeLimitArea3Seconds: null,
    numAreas: 1,
    numHides: 2,
    distractionCount: 1,
    ...patch,
  } satisfies EmergencyPacketClass;
}

function entryOf(id: string, classId: string, patch: Partial<PacketReportEntry> = {}) {
  return {
    id,
    armband: '101',
    runOrder: 1,
    callName: 'Juni',
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: 'REG-1',
    section: null,
    classId,
    trialId: 't1',
    dogId: 'dog-1',
    checkInStatus: 'no-status',
    ...patch,
  } satisfies PacketReportEntry;
}

const classes = [classOf('c1', 't1'), classOf('c2', 't2', { element: 'Interior' })];
const entries = [
  entryOf('e1', 'c1'),
  entryOf('e2', 'c1', { armband: '102', runOrder: 2, callName: 'Moss' }),
  entryOf('e3', 'c2', { armband: '201', trialId: 't2' }),
];
const classScope = { kind: 'class', showId: 's1', trialId: 't1', classId: 'c1' } as const;

function fingerprint(
  reportId: 'check-in-sheet' | 'scoresheet',
  patch: {
    classes?: EmergencyPacketClass[];
    entries?: PacketReportEntry[];
    trials?: EmergencyPacketTrial[];
  } = {}
) {
  return buildSheetDescriptorFromPrinted({
    reportId,
    scope: classScope,
    trials: patch.trials ?? trials,
    classes: patch.classes ?? classes,
    entries: patch.entries ?? entries,
  })?.fingerprint;
}

const withEntry = (index: number, patch: Partial<PacketReportEntry>) =>
  entries.map((entry, at) => (at === index ? { ...entry, ...patch } : entry));
const withClass = (patch: Partial<EmergencyPacketClass>) => [
  classOf('c1', 't1', patch),
  classes[1]!,
];

describe('buildSheetDescriptorFromPrinted', () => {
  it('keys subjects by entry and by class, only for the scope and only for printed entries', () => {
    const d = buildSheetDescriptorFromPrinted({
      reportId: 'check-in-sheet',
      scope: classScope,
      trials,
      classes,
      entries,
    });
    expect(Object.keys(d?.coverage.subjectFingerprints ?? {})).toEqual([
      'class:c1',
      'entry:e1',
      'entry:e2',
    ]);
    expect(d?.coverage.subjectScopes['entry:e1']).toEqual({ classIds: ['c1'], trialIds: ['t1'] });
  });

  it('returns an empty descriptor, not null, when nothing in scope prints', () => {
    for (const patch of [{ entries: [] }, { classes: [] }]) {
      const d = buildSheetDescriptorFromPrinted({
        reportId: 'scoresheet',
        scope: classScope,
        trials,
        classes,
        entries,
        ...patch,
      });
      expect(Object.keys(d?.coverage.subjectFingerprints ?? { x: 1 })).toEqual([]);
      expect(d?.fingerprint).toMatch(/^fnv1a64:/);
    }
    expect(
      buildSheetDescriptorFromPrinted({
        reportId: 'results-sheet',
        scope: classScope,
        trials,
        classes,
        entries,
      })
    ).toBeNull();
  });

  it('gives a class with no printed entry no class subject, in a show-wide print too', () => {
    const d = buildSheetDescriptorFromPrinted({
      reportId: 'scoresheet',
      scope: { kind: 'show', showId: 's1' },
      trials,
      classes,
      entries: entries.filter(entry => entry.classId === 'c1'),
    });
    expect(Object.keys(d?.coverage.subjectFingerprints ?? {})).toEqual([
      'class:c1',
      'entry:e1',
      'entry:e2',
    ]);
  });

  it('gives the same subject fingerprints for one class whatever the scope', () => {
    const show = buildSheetDescriptorFromPrinted({
      reportId: 'scoresheet',
      scope: { kind: 'show', showId: 's1' },
      trials,
      classes,
      entries,
    });
    const one = buildSheetDescriptorFromPrinted({
      reportId: 'scoresheet',
      scope: classScope,
      trials,
      classes,
      entries,
    });
    for (const key of Object.keys(one?.coverage.subjectFingerprints ?? {})) {
      expect(show?.coverage.subjectFingerprints[key]).toBe(one?.coverage.subjectFingerprints[key]);
    }
  });

  describe.each(['check-in-sheet', 'scoresheet'] as const)('%s', reportId => {
    const base = () => fingerprint(reportId);

    it.each([
      ['call name', { callName: 'Juno' }],
      ['breed', { breed: 'Basset' }],
      ['handler', { handler: 'Sam Reed' }],
      ['armband suffix', { armband: '101A' }],
      ['armband removed', { armband: null }],
    ])('moves on a printed entry fact: %s', (_label, patch) => {
      expect(fingerprint(reportId, { entries: withEntry(0, patch) })).not.toBe(base());
    });

    it.each([
      ['judge', { judgeName: 'Judge Two' }],
      ['no judge', { judgeName: '' }],
      ['ring', { ringLabel: 'Ring 2' }],
      ['class number', { classNumber: '12' }],
      ['section', { section: 'B' }],
      ['time limit', { timeLimitSeconds: 240 }],
      ['area 2 limit', { numAreas: 2, timeLimitArea2Seconds: 90 }],
    ])('moves on a printed class fact: %s', (_label, patch) => {
      expect(fingerprint(reportId, { classes: withClass(patch) })).not.toBe(base());
    });

    it('moves on the trial name and date, which print under the title', () => {
      expect(
        fingerprint(reportId, { trials: [{ ...trials[0]!, name: 'Spring Trial' }, trials[1]!] })
      ).not.toBe(base());
      expect(
        fingerprint(reportId, { trials: [{ ...trials[0]!, date: '2026-12-09' }, trials[1]!] })
      ).not.toBe(base());
    });

    it.each([
      ['dog id', { dogId: 'dog-9' }],
      ['check-in status', { checkInStatus: 'checked-in' }],
      ['section on the entry', { section: 'Z' }],
      ['scored flag', { isScored: true }],
      ['result text', { resultText: 'Q' }],
    ])('does not move on an unprinted entry fact: %s', (_label, patch) => {
      expect(fingerprint(reportId, { entries: withEntry(0, patch) })).toBe(base());
    });

    it('does not move on the class status or a fact of another class', () => {
      expect(
        fingerprint(reportId, {
          classes: [classes[0]!, { ...classes[1]!, judgeName: 'Someone Else' }],
        })
      ).toBe(base());
    });

    it('moves when an entry drops off the sheet (withdrawn, pulled or held) or joins it', () => {
      expect(fingerprint(reportId, { entries: [entries[0]!, entries[2]!] })).not.toBe(base());
      expect(
        fingerprint(reportId, { entries: [...entries, entryOf('e9', 'c1', { armband: '109' })] })
      ).not.toBe(base());
    });

    it('moves when two dogs swap places', () => {
      expect(
        fingerprint(reportId, {
          entries: withEntry(0, { runOrder: 2 }).map((entry, at) =>
            at === 1 ? { ...entry, runOrder: 1 } : entry
          ),
        })
      ).not.toBe(base());
    });
  });

  it('prints hides, distractions and the registry title only on the scoresheet', () => {
    for (const patch of [{ numHides: 3 }, { distractionCount: 4 }]) {
      expect(fingerprint('scoresheet', { classes: withClass(patch) })).not.toBe(
        fingerprint('scoresheet')
      );
      expect(fingerprint('check-in-sheet', { classes: withClass(patch) })).toBe(
        fingerprint('check-in-sheet')
      );
    }
    const ukc = [{ ...trials[0]!, registryId: 'UKC' }, trials[1]!];
    expect(fingerprint('scoresheet', { trials: ukc })).not.toBe(fingerprint('scoresheet'));
    expect(fingerprint('check-in-sheet', { trials: ukc })).toBe(fingerprint('check-in-sheet'));
  });

  it('prints the registration number only on the scoresheet', () => {
    const patched = withEntry(0, { registrationNumber: 'REG-9' });
    expect(fingerprint('scoresheet', { entries: patched })).not.toBe(fingerprint('scoresheet'));
    expect(fingerprint('check-in-sheet', { entries: patched })).toBe(fingerprint('check-in-sheet'));
  });

  it('prints the check-in order position, and moves a scoresheet only by its row', () => {
    // run_order 1 -> 3 keeps both rows in place: the position (1, 2) is what prints.
    const gap = withEntry(1, { runOrder: 3 });
    expect(fingerprint('check-in-sheet', { entries: gap })).toBe(fingerprint('check-in-sheet'));
    // A dog with no run order prints a blank order and sorts last.
    const unordered = withEntry(0, { runOrder: null });
    expect(fingerprint('check-in-sheet', { entries: unordered })).not.toBe(
      fingerprint('check-in-sheet')
    );
  });

  it('hashes a numeric-looking and a suffixed armband by their printed label', () => {
    expect(fingerprint('check-in-sheet', { entries: withEntry(0, { armband: '101' }) })).toBe(
      fingerprint('check-in-sheet')
    );
    expect(fingerprint('check-in-sheet', { entries: withEntry(0, { armband: ' 101 ' }) })).toBe(
      fingerprint('check-in-sheet')
    );
  });
});
