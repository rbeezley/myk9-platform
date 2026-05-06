import { Text, View } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../types/premium-types';
import type { StyleTokens } from './pdfStyles';
import { formatDate } from './pdfStyles';

interface Props {
  data: GeneratedPremium;
  tokens: StyleTokens;
}

interface Row {
  label: string;
  value: string;
}

/**
 * Editorial "At a Glance" panel rendered inside the Magazine cover where an
 * image slot would otherwise sit. Lists trial count + dates, elements, levels,
 * sanctioning org, and a field-limit / entry-close fallback. Empty rows hide
 * individually; the card collapses to a single italic placeholder when none
 * of the substantive fields (trials/elements/levels) are populated — org or
 * entry-close alone aren't enough to make the panel useful.
 */
export function AtAGlancePanel({ data, tokens }: Props) {
  const rows = buildRows(data);
  const hasSubstantiveContent = rows.some(
    r => r.label === 'Trials' || r.label === 'Elements' || r.label === 'Levels'
  );

  return (
    <View
      style={{
        marginTop: 32,
        marginHorizontal: 'auto',
        width: '70%',
        borderTopWidth: 0.75,
        borderTopColor: tokens.secondaryColor,
        borderBottomWidth: 0.75,
        borderBottomColor: tokens.secondaryColor,
        paddingVertical: 18,
        paddingHorizontal: 20,
        backgroundColor: tokens.surfaceColor,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.bodyFont,
          fontSize: 8,
          color: tokens.secondaryColor,
          textTransform: 'uppercase',
          letterSpacing: 3,
          textAlign: 'center',
          marginBottom: 14,
        }}
      >
        At a Glance
      </Text>
      {!hasSubstantiveContent ? (
        <Text
          style={{
            fontFamily: tokens.displayFont,
            fontStyle: 'italic',
            fontSize: 11,
            color: tokens.textColor,
            textAlign: 'center',
          }}
        >
          Details coming soon
        </Text>
      ) : (
        rows.map(row => (
          <View
            key={row.label}
            style={{
              flexDirection: 'row',
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.bodyFont,
                fontWeight: 700,
                fontSize: 8,
                color: tokens.secondaryColor,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                width: 90,
              }}
            >
              {row.label}
            </Text>
            <Text
              style={{
                fontFamily: tokens.displayFont,
                fontSize: 11,
                color: tokens.textColor,
                flex: 1,
              }}
            >
              {row.value}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function buildRows(data: GeneratedPremium): Row[] {
  const rows: Row[] = [];
  const trials = data.trials ?? [];

  if (trials.length > 0) {
    const dates = trials.map(t => formatDate(t.date));
    const uniqueDates = Array.from(new Set(dates));
    rows.push({
      label: 'Trials',
      value: `${trials.length} · ${uniqueDates.join(', ')}`,
    });
  }

  const elements = unique(trials.flatMap(t => t.classes.map(c => c.element)).filter(Boolean));
  if (elements.length > 0) {
    rows.push({ label: 'Elements', value: elements.join(' · ') });
  }

  const levels = unique(trials.flatMap(t => t.classes.map(c => c.level)).filter(Boolean));
  if (levels.length > 0) {
    rows.push({ label: 'Levels', value: levels.join(' · ') });
  }

  if (data.org) {
    rows.push({ label: 'Sanctioning', value: data.org });
  }

  if (data.show.entryCloseDate) {
    rows.push({
      label: 'Entries Close',
      value: formatDate(data.show.entryCloseDate),
    });
  }

  return rows;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
