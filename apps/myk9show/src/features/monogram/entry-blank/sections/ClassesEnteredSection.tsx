import { Text, View } from '@react-pdf/renderer';
import type {
  EntryBlankLevelCell,
  EntryBlankTrialRow,
} from '@/features/heritage/entry-blank/types';
import { BODY, BRONZE, Checkbox, DISPLAY, INK, MUTE, SectionHeader } from './pdfPrimitives';

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
      <SectionHeader numeral="ii" title="Classes entered · mark all that apply" />

      {/* Trial selection table */}
      <View>
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 0.5,
            borderBottomColor: INK,
            paddingBottom: 2,
            marginBottom: 3,
          }}
        >
          {['Trial', 'Date', 'Element', 'Judge', 'Enter'].map((h, i) => (
            <Text
              key={h}
              style={{
                fontFamily: BODY,
                fontSize: 7,
                fontWeight: 500,
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: BRONZE,
                width: i === 0 ? '10%' : i === 4 ? '12%' : '24%',
                textAlign: i === 4 ? 'center' : 'left',
              }}
            >
              {h}
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
              borderBottomColor: BRONZE,
              borderStyle: 'dashed',
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontSize: 9,
                color: BRONZE,
                width: '10%',
              }}
            >
              {row.numeral}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>
              {row.dateLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>
              {row.elementsLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>
              {row.judgeName}
            </Text>
            <View style={{ width: '12%', alignItems: 'center' }}>
              <Checkbox checked={row.checked} />
            </View>
          </View>
        ))}
      </View>

      {/* Level / element grid */}
      <Text
        style={{
          fontFamily: BODY,
          fontSize: 7,
          fontWeight: 500,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          color: MUTE,
          marginTop: 8,
          marginBottom: 3,
        }}
      >
        Mark the level entered for each element
      </Text>

      {Array.from(grouped.entries()).map(([level, cells]) => (
        <View key={level} style={{ flexDirection: 'row', marginBottom: 3 }}>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 9,
              color: BRONZE,
              width: '18%',
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
