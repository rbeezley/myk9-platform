import { Page, Text, View } from '@react-pdf/renderer';
import type { CoverContext } from './coverContext';

/**
 * Field-guide cover — utility/reference treatment. Mono eyebrow, sans title,
 * §-numbered table of contents, and a 4-cell quick-stats grid.
 */
const SECTIONS: Array<readonly [string, string]> = [
  ['§00', 'OVERVIEW'],
  ['§01', 'OFFICIALS'],
  ['§02', 'JUDGES'],
  ['§03', 'CLASSES'],
  ['§04', 'ENTRY'],
  ['§05', 'SCHEDULE'],
  ['§06', 'LOCATION'],
  ['§07', 'NOTICES'],
];

export function renderFieldGuideCover(ctx: CoverContext) {
  const { t, data, dateRange } = ctx;
  const showName = data.show.name || 'Premium Information';
  const monoFont = t.monoFont ?? 'IBM Plex Mono';

  const trialsCount = data.trials?.length ?? 0;
  const elements = new Set<string>();
  const levels = new Set<string>();
  const judgeNames = new Set<string>();
  for (const trial of data.trials ?? []) {
    for (const c of trial.classes ?? []) {
      if (c?.element) elements.add(c.element);
      if (c?.level) levels.add(c.level);
    }
    for (const j of trial.judges ?? []) {
      if (j?.name) judgeNames.add(j.name);
    }
  }
  const judgeCount = judgeNames.size;

  const stats: Array<readonly [string, string]> = [
    ['TRIALS', String(trialsCount)],
    ['ELEMENTS', String(elements.size)],
    ['LEVELS', String(levels.size)],
    ['JUDGES', String(judgeCount)],
  ];

  return (
    <Page
      size="LETTER"
      style={{
        backgroundColor: t.surfaceColor,
        padding: t.pagePadding,
        color: t.textColor,
        fontFamily: t.bodyFont,
        fontSize: t.bodyFontSize,
      }}
    >
      {/* Eyebrow */}
      <Text
        style={{
          fontFamily: monoFont,
          fontSize: 9,
          color: t.accentColor,
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginBottom: 16,
        }}
      >
        AT-A-TRIAL REFERENCE
      </Text>

      {/* Title block */}
      <Text
        style={{
          fontFamily: t.displayFont,
          fontSize: 24,
          fontWeight: 700,
          color: t.textColor,
          lineHeight: 1.15,
        }}
      >
        {showName}
      </Text>
      <Text
        style={{
          fontFamily: t.bodyFont,
          fontSize: 11,
          color: t.secondaryColor,
          marginTop: 4,
        }}
      >
        {dateRange}
      </Text>

      {/* Divider */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: t.accentColor,
          marginTop: 24,
          marginBottom: 16,
        }}
      />

      {/* Section index — 8 rows, single column */}
      <Text
        style={{
          fontFamily: monoFont,
          fontSize: 8,
          color: t.secondaryColor,
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginBottom: 8,
        }}
      >
        CONTENTS
      </Text>
      <View style={{ marginBottom: 24 }}>
        {SECTIONS.map(([num, title]) => (
          <View
            key={num}
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              paddingVertical: 4,
              borderBottomWidth: 0.5,
              borderBottomColor: t.secondaryColor,
            }}
          >
            <Text
              style={{
                fontFamily: monoFont,
                fontSize: 10,
                color: t.accentColor,
                width: 36,
              }}
            >
              {num}
            </Text>
            <Text
              style={{
                fontFamily: t.bodyFont,
                fontSize: 11,
                color: t.textColor,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              {title}
            </Text>
          </View>
        ))}
      </View>

      {/* Quick-stats grid */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 16,
          borderTopWidth: 1,
          borderTopColor: t.accentColor,
          paddingTop: 12,
        }}
      >
        {stats.map(([label, value]) => (
          <View key={label} style={{ flex: 1, paddingHorizontal: 4 }}>
            <Text
              style={{
                fontFamily: monoFont,
                fontSize: 7,
                color: t.secondaryColor,
                textTransform: 'uppercase',
                letterSpacing: 2,
                marginBottom: 4,
              }}
            >
              {label}
            </Text>
            <Text
              style={{
                fontFamily: t.bodyFont,
                fontSize: 22,
                color: t.textColor,
                fontWeight: 700,
              }}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </Page>
  );
}
