import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank';
import {
  BODY,
  Checkbox,
  DISPLAY,
  GOLD_2,
  GOLD_3,
  INK,
  MagazineSectionHeader,
  META,
  MUTE,
  PAPER,
} from './pdfPrimitives';

type TrialRow = EntryBlankProps['trials'][number];
type LevelCell = EntryBlankProps['levelCells'][number];

function groupByLevel(cells: LevelCell[]) {
  const map = new Map<string, LevelCell[]>();
  for (const cell of cells) {
    const arr = map.get(cell.level) ?? [];
    arr.push(cell);
    map.set(cell.level, arr);
  }
  return map;
}

/**
 * §II Classes Entered.
 *
 * Two sub-blocks per the handoff:
 * 1. Trial selection table — one row per trial, with lowercase Roman numeral
 *    in italic gold-3, day label, elements, judge name, and an `Enter`
 *    checkbox.
 * 2. Level grid — 4 levels × 4 elements = 16 cells in a bordered grid, plus
 *    an `Other` row for Handler Discrimination and Detective.
 */
export function ClassesEnteredSection({
  trials,
  levelCells,
}: {
  trials: TrialRow[];
  levelCells: LevelCell[];
}) {
  const grouped = groupByLevel(levelCells);

  return (
    <View>
      <MagazineSectionHeader
        numeral="ii"
        title="Classes entered"
        kicker="mark each trial · level below"
      />

      {/* Trial table */}
      <View>
        {/* Header row */}
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 0.5,
            borderBottomColor: INK,
            paddingBottom: 4,
            marginBottom: 4,
          }}
        >
          {['Trial', 'Day', 'Elements', 'Judge', 'Enter'].map((h, i) => (
            <Text
              key={h}
              style={{
                fontFamily: META,
                fontWeight: 500,
                fontSize: 7,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: MUTE,
                width: i === 0 ? '10%' : i === 4 ? '14%' : '25%',
                textAlign: i === 4 ? 'center' : 'left',
              }}
            >
              {h}
            </Text>
          ))}
        </View>

        {/* Body rows */}
        {trials.map((row, idx) => (
          <View
            key={`${row.numeral}-${idx}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 0.5,
              borderBottomColor: GOLD_2,
              borderStyle: 'dashed',
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 12,
                color: GOLD_3,
                width: '10%',
              }}
            >
              {row.numeral.toLowerCase()}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '25%' }}>
              {row.dateLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '25%' }}>
              {row.elementsLabel}
            </Text>
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontSize: 10,
                color: INK,
                width: '25%',
              }}
            >
              {row.judgeName}
            </Text>
            <View style={{ width: '14%', alignItems: 'center' }}>
              <Checkbox checked={row.checked} />
            </View>
          </View>
        ))}
      </View>

      {/* Level / element grid */}
      <Text
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: MUTE,
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        Mark the level entered for each element
      </Text>

      <View
        style={{
          borderWidth: 0.5,
          borderColor: INK,
        }}
      >
        {Array.from(grouped.entries()).map(([level, cells], rowIdx) => (
          <View
            key={level}
            style={{
              flexDirection: 'row',
              borderBottomWidth: rowIdx === grouped.size - 1 ? 0 : 0.5,
              borderBottomColor: GOLD_2,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: 11,
                color: INK,
                width: '20%',
                padding: 6,
                backgroundColor: PAPER,
              }}
            >
              {level}
            </Text>
            <View
              style={{
                width: '80%',
                flexDirection: 'row',
                flexWrap: 'wrap',
                padding: 4,
              }}
            >
              {cells.map(cell => (
                <View
                  key={cell.element}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    width: '50%',
                    paddingVertical: 2,
                  }}
                >
                  <Checkbox checked={cell.checked} />
                  <Text style={{ fontFamily: BODY, fontSize: 8.5, color: INK }}>
                    {cell.element}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
