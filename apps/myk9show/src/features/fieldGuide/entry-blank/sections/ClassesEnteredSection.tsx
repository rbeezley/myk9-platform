import { Text, View } from '@react-pdf/renderer';
import type {
  EntryBlankLevelCell,
  EntryBlankTrialRow,
} from '@/features/heritage/entry-blank/types';
import {
  BODY,
  Checkbox,
  HAIR,
  INK,
  MONO,
  MUTE,
  ORANGE_DEEP,
  PAPER_WARM,
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
      <SectionHeader folio="§02" title="Classes entered" meta="MARK EACH TRIAL" />

      {/* Trial table header */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: PAPER_WARM,
          borderBottomWidth: 1,
          borderBottomColor: INK,
          paddingVertical: 4,
          paddingHorizontal: 6,
        }}
      >
        {['TRIAL', 'DAY', 'ELEMENTS', 'JUDGE', 'ENTER'].map((h, i) => (
          <Text
            key={h}
            style={{
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 7,
              letterSpacing: 0.5,
              color: MUTE,
              width: i === 0 ? '10%' : i === 4 ? '12%' : '26%',
              textAlign: i === 4 ? 'center' : 'left',
            }}
          >
            {h}
          </Text>
        ))}
      </View>

      {trials.map((row, idx) => (
        <View
          key={row.numeral}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 0.5,
            borderBottomColor: HAIR,
            paddingVertical: 4,
            paddingHorizontal: 6,
            backgroundColor: idx % 2 === 1 ? PAPER_WARM : 'transparent',
          }}
        >
          <Text
            style={{
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 9,
              color: ORANGE_DEEP,
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

      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 0.5,
          color: MUTE,
          marginTop: 8,
          marginBottom: 3,
          textTransform: 'uppercase',
        }}
      >
        Mark the level entered for each element
      </Text>

      {Array.from(grouped.entries()).map(([level, cells]) => (
        <View key={level} style={{ flexDirection: 'row', marginBottom: 3 }}>
          <Text
            style={{
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 8,
              letterSpacing: 0.5,
              color: ORANGE_DEEP,
              width: '18%',
              textTransform: 'uppercase',
            }}
          >
            {level}
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
