import { Text, View } from '@react-pdf/renderer';
import type {
  EntryBlankLevelCell,
  EntryBlankTrialRow,
} from '@/features/heritage/entry-blank/types';
import { BODY, Checkbox, DISPLAY, INK, MUTE, SectionHeader } from './pdfPrimitives';

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
  flag,
}: {
  trials: EntryBlankTrialRow[];
  levelCells: EntryBlankLevelCell[];
  flag: string;
}) {
  const grouped = groupByLevel(levelCells);

  return (
    <View>
      <SectionHeader number="02" title="Classes entered · mark all that apply" flag={flag} />

      <View>
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 2,
            borderBottomColor: flag,
            paddingBottom: 2,
            marginBottom: 3,
          }}
        >
          {['Trial', 'Date', 'Element', 'Judge', 'Enter'].map((h, i) => (
            <Text
              key={h}
              style={{
                fontFamily: BODY,
                fontWeight: 500,
                fontSize: 7,
                letterSpacing: 1.8,
                color: MUTE,
                width: i === 0 ? '10%' : i === 4 ? '12%' : '24%',
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
              borderBottomColor: '#d8d8d4',
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: 0.5,
                color: flag,
                width: '10%',
              }}
            >
              {row.numeral}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>{row.dateLabel}</Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>{row.elementsLabel}</Text>
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, width: '24%' }}>{row.judgeName}</Text>
            <View style={{ width: '12%', alignItems: 'center' }}>
              <Checkbox checked={row.checked} flag={flag} />
            </View>
          </View>
        ))}
      </View>

      <Text
        style={{
          fontFamily: BODY,
          fontWeight: 500,
          fontSize: 7,
          letterSpacing: 1.8,
          color: MUTE,
          marginTop: 8,
          marginBottom: 3,
        }}
      >
        MARK THE LEVEL ENTERED FOR EACH ELEMENT
      </Text>

      {Array.from(grouped.entries()).map(([level, cells]) => (
        <View key={level} style={{ flexDirection: 'row', marginBottom: 3 }}>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 9,
              letterSpacing: 0.5,
              color: flag,
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
              <Checkbox checked={cell.checked} flag={flag} />
              <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{cell.element}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
