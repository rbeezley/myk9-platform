import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankLevelCell, EntryBlankTrialRow } from '../types';
import { BODY, BROWN, Checkbox, DISPLAY, HAIR, INK, META, QUILL, SectionHead } from './pdfPrimitives';

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
 * Section ii. Classes entered — trial-rotation table + level/element
 * checkbox grid. Trial numerals render in italic Playfair-brown to echo
 * the lowercase-roman folio convention.
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
      <SectionHead folio="ii." title="Classes entered" kicker="mark each trial · level below" />

      {/* Trial rows */}
      <View>
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 0.6,
            borderBottomColor: INK,
            paddingBottom: 2,
            marginBottom: 2,
          }}
        >
          {['Trial', 'Day', 'Elements', 'Judge', 'Enter'].map((h, i) => (
            <Text
              key={h}
              style={{
                fontFamily: META,
                fontWeight: 500,
                fontSize: 6.5,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: QUILL,
                width: i === 0 ? '9%' : i === 4 ? '14%' : i === 3 ? '23%' : '27%',
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
              borderBottomWidth: 0.4,
              borderBottomColor: HAIR,
              borderStyle: 'dotted',
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontWeight: 700,
                fontSize: 12,
                color: BROWN,
                width: '9%',
              }}
            >
              {row.numeral.toLowerCase()}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 8.5, color: INK, width: '27%' }}>
              {row.dateLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 8.5, color: INK, width: '27%' }}>
              {row.elementsLabel}
            </Text>
            <Text style={{ fontFamily: BODY, fontSize: 8.5, color: INK, width: '23%' }}>
              {row.judgeName}
            </Text>
            <View style={{ width: '14%', alignItems: 'center' }}>
              <Checkbox checked={row.checked} />
            </View>
          </View>
        ))}
      </View>

      {/* Level grid */}
      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: 'italic',
          fontSize: 8.5,
          color: QUILL,
          marginTop: 8,
          marginBottom: 3,
        }}
      >
        Mark the level entered for each element:
      </Text>
      {Array.from(grouped.entries()).map(([level, cells]) => (
        <View key={level} style={{ flexDirection: 'row', marginBottom: 2 }}>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 10,
              color: INK,
              width: '18%',
            }}
          >
            {level}
          </Text>
          {cells.map(cell => (
            <View
              key={cell.element}
              style={{ flexDirection: 'row', alignItems: 'center', width: '20%', gap: 4 }}
            >
              <Checkbox checked={cell.checked} />
              <Text style={{ fontFamily: BODY, fontSize: 8.5, color: INK }}>{cell.element}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
