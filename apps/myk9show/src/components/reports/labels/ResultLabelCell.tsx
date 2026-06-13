import React from 'react';
import type { ResultLabelItem } from '@/lib/labels/resultLabelData';

// Inline styles (not CSS classes) so the markup renders identically in the
// on-screen live preview AND when ReactDOMServer serializes it into the print
// iframe. Every text line truncates with an ellipsis instead of wrapping — the
// fixed-height `.label-cell` clips overflow, so a long name/handler/club can
// never push the layout and drift the sheet.
const truncate: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const styles = {
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    height: '100%',
    fontFamily: 'Arial, sans-serif',
    color: '#000',
    overflow: 'hidden',
    lineHeight: 1.2,
  } as React.CSSProperties,
  head: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    overflow: 'hidden',
  } as React.CSSProperties,
  armband: {
    fontSize: '16px',
    fontWeight: 'bold',
    flexShrink: 0,
  } as React.CSSProperties,
  name: {
    fontSize: '13px',
    fontWeight: 600,
    ...truncate,
  } as React.CSSProperties,
  handler: {
    fontSize: '11px',
    color: '#333',
    ...truncate,
  } as React.CSSProperties,
  club: {
    fontSize: '11px',
    fontWeight: 'bold',
    ...truncate,
  } as React.CSSProperties,
  meta: {
    fontSize: '10px',
    color: '#555',
    ...truncate,
  } as React.CSSProperties,
  results: {
    display: 'flex',
    gap: '10px',
    fontSize: '10px',
    fontWeight: 'bold',
    marginTop: 'auto',
  } as React.CSSProperties,
};

export const ResultLabelCell: React.FC<{ item: ResultLabelItem }> = ({ item }) => {
  const metaLine = [item.showName, item.trialClassLine].filter(Boolean).join(' — ');

  return (
    <div style={styles.label}>
      <div style={styles.head}>
        <span style={styles.armband}>#{item.armband}</span>
        <span style={styles.name}>{item.callName}</span>
      </div>
      {item.handler && <div style={styles.handler}>{item.handler}</div>}
      {item.clubName && <div style={styles.club}>{item.clubName}</div>}
      {metaLine && <div style={styles.meta}>{metaLine}</div>}
      {item.hasResults && (
        <div style={styles.results}>
          {item.placement !== null && <span>Place: {item.placement}</span>}
          {item.timeStr !== '' && <span>Time: {item.timeStr}</span>}
          {item.faults !== null && <span>Faults: {item.faults}</span>}
        </div>
      )}
    </div>
  );
};
