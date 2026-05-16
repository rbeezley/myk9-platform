import { Text, View } from '@react-pdf/renderer';
import type {
  EntryBlankLevelCell,
  EntryBlankTrialRow,
} from '@/features/heritage/entry-blank/types';
import {
  BODY,
  Checkbox,
  DISPLAY,
  HAIR,
  INK,
  MONO,
  MUTE,
  RED,
  SectionHeader,
} from './pdfPrimitives';

function groupByLevel(cells: EntryBlankLevelCell[]) {
  const map = new Map<string, EntryBlankLevelCell[]>();
  for (const cell of cells) {
    const arr = map.get(cell.level) ?? [];
    arr.push(cell);
    map.set(cell.level, arr);
  }
  return map;
}

/**
 * Classes-entered section — trial table + level grid. The trial column
 * uses an Inter Tight 900 zero-padded numeral in red (Archivo Black
 * substitute), mirroring the design mock's giant red `01` / `02` style.
 */
export function ClassesEnteredSection({
  trials,
  levelCells,
}: {
  trials: EntryBlankTrialRow[];
  levelCells: EntryBlankLevelCell[];
}) {
  const grouped = groupByLevel(levelCells);

  return (
    <View>
      <SectionHeader number="02" title="Classes entered" kicker="mark each trial · level below" />

      {/* Trial table */}
      <View>
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1.5,
            borderBottomColor: INK,
            paddingBottom: 3,
            marginBottom: 3,
          }}
        >
          {['Trial', 'Day', 'Elements', 'Judge', 'Enter'].map((h, i) => (
            <Text
              key={h}
              style={{
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: 7,
                letterSpacing: 1.4,
                color: MUTE,
                width: i === 0 ? '10%' : i === 4 ? '12%' : '26%',
                textAlign: i === 4 ? 'center' : 'left',
              }}
            >
              {h.toUpperCase()}
            </Text>
          ))}
        </View>

        {trials.map(row => (
          <View
            key={row.numeral}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderBottomWidth: 0.5,
              borderBottomColor: HAIR,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 14,
                letterSpacing: -0.5,
                color: RED,
                width: '10%',
              }}
            >
              {row.numeral}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '26%' }}>
              {row.dateLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '26%' }}>
              {row.elementsLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '26%' }}>
              {row.judgeName}
            </Text>
            <View style={{ width: '12%', alignItems: 'center' }}>
              <Checkbox checked={row.checked} />
            </View>
          </View>
        ))}
      </View>

      {/* Level grid */}
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 1.4,
          color: MUTE,
          marginTop: 8,
          marginBottom: 3,
        }}
      >
        MARK THE LEVEL ENTERED FOR EACH ELEMENT
      </Text>

      {Array.from(grouped.entries()).map(([level, cells]) => (
        <View key={level} style={{ flexDirection: 'row', marginBottom: 3, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 9,
              letterSpacing: -0.2,
              color: INK,
              width: '18%',
            }}
          >
            {level.toUpperCase()}
          </Text>
          {cells.map(cell => (
            <View
              key={cell.element}
              style={{ flexDirection: 'row', alignItems: 'center', width: '20%', gap: 3 }}
            >
              <Checkbox checked={cell.checked} />
              <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{cell.element}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
