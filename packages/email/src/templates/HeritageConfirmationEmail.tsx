import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { HeritageConfirmationProps, HeritageRunRow } from '../types';

// ─── Palette ─────────────────────────────────────────────────────────────────
const INK = '#1a1612';
const PAPER = '#f8f4ea';
const CLARET = '#8a1818';
const GOLD = '#8a6a45';
const QUILL = '#6b4f3a';

// ─── Font stacks ─────────────────────────────────────────────────────────────
const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const BODY_FONT = "'EB Garamond', Georgia, serif";

// ─── Ornament rule (email-safe: div line-trick, not border) ──────────────────
// Outlook strips borders on inline elements but respects background-color on div.
// This is the critical pattern from the design handoff.
function OrnamentRule({ color = INK, width = 110 }: { color?: string; width?: number }) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      align="center"
      style={{ margin: '0 auto' }}
    >
      <tr>
        <td style={{ width, verticalAlign: 'middle', fontSize: 0, lineHeight: 0 }}>
          <div style={{ width, height: 1, background: color, fontSize: 0, lineHeight: '0' }}>
            &nbsp;
          </div>
        </td>
        <td
          style={{
            padding: '0 10px',
            fontFamily: DISPLAY,
            fontSize: 18,
            lineHeight: 1,
            color: CLARET,
            verticalAlign: 'middle',
          }}
        >
          ✦
        </td>
        <td style={{ width, verticalAlign: 'middle', fontSize: 0, lineHeight: 0 }}>
          <div style={{ width, height: 1, background: color, fontSize: 0, lineHeight: '0' }}>
            &nbsp;
          </div>
        </td>
      </tr>
    </table>
  );
}

// ─── Runs table ───────────────────────────────────────────────────────────────
function RunsTable({ runs }: { runs: HeritageRunRow[] }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ marginTop: 6 }}
    >
      {/* Header */}
      <tr>
        {['Trial', 'Day', 'Class', 'Judge', 'Armband'].map((h, i) => (
          <td
            key={h}
            style={{
              paddingBottom: 6,
              borderBottom: `1px solid ${INK}`,
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: 11,
              color: QUILL,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              textAlign: i === 4 ? 'right' : 'left',
            }}
          >
            {h}
          </td>
        ))}
      </tr>
      {/* Rows */}
      {runs.map((run, i) => {
        const isLast = i === runs.length - 1;
        const cellBase: React.CSSProperties = {
          padding: '8px 0',
          borderBottom: isLast ? undefined : `1px dotted ${GOLD}`,
        };
        return (
          <tr key={run.trialNumeral}>
            <td
              style={{
                ...cellBase,
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                color: CLARET,
                fontSize: 14,
              }}
            >
              {run.trialNumeral}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13 }}>{run.dayLabel}</td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13 }}>{run.classLabel}</td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13 }}>{run.judgeName}</td>
            <td
              style={{
                ...cellBase,
                fontFamily: DISPLAY,
                fontWeight: 500,
                fontSize: 16,
                color: INK,
                textAlign: 'right',
              }}
            >
              {run.armband ?? '—'}
            </td>
          </tr>
        );
      })}
    </table>
  );
}

// ─── On-the-day info block ────────────────────────────────────────────────────
function InfoCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <p
        style={{ margin: 0, fontFamily: DISPLAY, fontStyle: 'italic', color: QUILL, fontSize: 12 }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '2px 0 10px',
          color: INK,
          fontFamily: BODY_FONT,
          fontSize: 13,
          lineHeight: 1.55,
        }}
        dangerouslySetInnerHTML={{
          __html: value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>'),
        }}
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function HeritageConfirmationEmail({
  clubName,
  clubEstablished,
  clubCity,
  showTitle,
  dateRange,
  salutation,
  dogRegisteredName,
  dogCallName,
  dogBreed,
  dogSex,
  runs,
  runCount,
  totalFeesFormatted,
  receiptNumber,
  doorsTime,
  firstClassTime,
  venueNameAndAddress,
  parkingNotes,
  hospitalityNotes,
  cratingNotes,
  secretaryEmail,
  secretaryPhone,
  trialUrl,
  trialChairName,
  trialChairTitle,
  memberClubLanguage,
}: HeritageConfirmationProps): JSX.Element {
  const dogLine = [dogCallName ? `called "${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  return (
    <Html lang="en">
      <Head>
        {/* Web fonts — head only; email clients that block CSS will fall back to Georgia */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Your entry to ${showTitle} is confirmed — ${salutation}`}</Preview>

      <Body style={{ margin: 0, padding: 0, background: '#d9d2c2' }}>
        {/* Outer wrapper table — 100% width */}
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: '#d9d2c2', padding: '32px 0' }}
        >
          <tr>
            <td align="center">
              {/* 600px email body */}
              <table
                role="presentation"
                width={600}
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ width: 600, maxWidth: 600, background: PAPER }}
              >
                {/* ── HEADER ── */}
                <tr>
                  <td style={{ padding: '36px 48px 12px', textAlign: 'center' }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 13,
                        color: QUILL,
                        letterSpacing: '0.04em',
                      }}
                    >
                      A formal confirmation from
                    </p>
                    <p
                      style={{
                        margin: '4px 0 2px',
                        fontFamily: DISPLAY,
                        fontWeight: 600,
                        fontSize: 18,
                        textTransform: 'uppercase',
                        letterSpacing: '0.18em',
                        color: INK,
                      }}
                    >
                      {clubName}
                    </p>
                    {(clubEstablished || clubCity) && (
                      <p
                        style={{
                          margin: '0 0 16px',
                          fontFamily: BODY_FONT,
                          fontStyle: 'italic',
                          fontSize: 11,
                          color: QUILL,
                        }}
                      >
                        {[clubEstablished, clubCity].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <OrnamentRule color={INK} width={110} />
                    <h1
                      style={{
                        margin: '12px 0 4px',
                        fontFamily: DISPLAY,
                        fontWeight: 500,
                        fontStyle: 'italic',
                        fontSize: 38,
                        lineHeight: 1.05,
                        color: INK,
                      }}
                    >
                      Your entry is{' '}
                      <em style={{ color: CLARET, fontStyle: 'italic' }}>confirmed</em>.
                    </h1>
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontFamily: BODY_FONT,
                        fontSize: 12,
                        letterSpacing: '0.28em',
                        textTransform: 'uppercase',
                        color: QUILL,
                      }}
                    >
                      {showTitle} · {dateRange}
                    </p>
                  </td>
                </tr>

                {/* ── GREETING ── */}
                <tr>
                  <td
                    style={{
                      padding: '18px 56px 6px',
                      fontFamily: BODY_FONT,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: INK,
                    }}
                  >
                    <p style={{ margin: '0 0 12px' }}>
                      Dear{' '}
                      <em style={{ fontFamily: DISPLAY, fontStyle: 'italic', color: CLARET }}>
                        {salutation}
                      </em>
                      ,
                    </p>
                    <p style={{ margin: '0 0 12px' }}>
                      We have the pleasure of confirming your entry to the{' '}
                      <em style={{ fontFamily: DISPLAY, fontStyle: 'italic' }}>{showTitle}</em>. The
                      draw has been completed and the running order is set; your particulars are
                      recorded as follows.
                    </p>
                  </td>
                </tr>

                {/* ── ENTRY DETAIL CARD ── */}
                <tr>
                  <td style={{ padding: '12px 48px' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{
                        borderTop: `1px solid ${INK}`,
                        borderBottom: `1px solid ${INK}`,
                        padding: '18px 0',
                      }}
                    >
                      <tr>
                        <td style={{ padding: '14px 8px' }}>
                          <p
                            style={{
                              margin: 0,
                              fontFamily: DISPLAY,
                              fontStyle: 'italic',
                              fontSize: 13,
                              color: CLARET,
                              letterSpacing: '0.06em',
                            }}
                          >
                            § The Dog
                          </p>
                          <p
                            style={{
                              margin: '4px 0 2px',
                              fontFamily: DISPLAY,
                              fontSize: 24,
                              fontWeight: 500,
                              lineHeight: 1.15,
                              color: INK,
                            }}
                          >
                            {dogRegisteredName}
                          </p>
                          {dogLine && (
                            <p
                              style={{
                                margin: '0 0 14px',
                                fontFamily: BODY_FONT,
                                fontStyle: 'italic',
                                fontSize: 13,
                                color: QUILL,
                              }}
                            >
                              {dogLine}
                            </p>
                          )}
                          <RunsTable runs={runs} />
                          <p
                            style={{
                              margin: '16px 0 0',
                              fontFamily: BODY_FONT,
                              fontSize: 12,
                              color: QUILL,
                              lineHeight: 1.55,
                            }}
                          >
                            <em style={{ fontFamily: DISPLAY, fontStyle: 'italic' }}>
                              {runCount} {runCount === 1 ? 'run' : 'runs'} entered.
                            </em>{' '}
                            Total fees received:{' '}
                            <span style={{ color: INK }}>{totalFeesFormatted}</span>
                            {receiptNumber ? `. Receipt #${receiptNumber}.` : '.'}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── ON THE DAY ── */}
                {(doorsTime ||
                  firstClassTime ||
                  venueNameAndAddress ||
                  parkingNotes ||
                  hospitalityNotes ||
                  cratingNotes) && (
                  <tr>
                    <td style={{ padding: '24px 48px 8px' }}>
                      <p
                        style={{
                          margin: 0,
                          textAlign: 'center',
                          fontFamily: DISPLAY,
                          fontStyle: 'italic',
                          fontSize: 13,
                          color: CLARET,
                          letterSpacing: '0.04em',
                        }}
                      >
                        § On the Day
                      </p>
                      <h2
                        style={{
                          margin: '4px 0 16px',
                          textAlign: 'center',
                          fontFamily: DISPLAY,
                          fontStyle: 'italic',
                          fontWeight: 500,
                          fontSize: 26,
                          color: INK,
                        }}
                      >
                        What to expect
                      </h2>
                      <table
                        role="presentation"
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                      >
                        <tr>
                          <td
                            style={{
                              width: '50%',
                              padding: '6px 12px 6px 0',
                              verticalAlign: 'top',
                              fontFamily: BODY_FONT,
                              fontSize: 13,
                              lineHeight: 1.55,
                            }}
                          >
                            <InfoCell label="Doors" value={doorsTime} />
                            <InfoCell label="First class" value={firstClassTime} />
                            <InfoCell label="Crating" value={cratingNotes} />
                          </td>
                          <td
                            style={{
                              width: '50%',
                              padding: '6px 0 6px 12px',
                              verticalAlign: 'top',
                              fontFamily: BODY_FONT,
                              fontSize: 13,
                              lineHeight: 1.55,
                            }}
                          >
                            <InfoCell label="Venue" value={venueNameAndAddress} />
                            <InfoCell label="Parking" value={parkingNotes} />
                            <InfoCell label="Hospitality" value={hospitalityNotes} />
                          </td>
                        </tr>
                      </table>
                      {runs[0]?.armband && (
                        <p
                          style={{
                            margin: '18px 0 0',
                            padding: '12px 16px',
                            background: 'rgba(138,106,69,0.08)',
                            borderLeft: `2px solid ${GOLD}`,
                            borderRight: `2px solid ${GOLD}`,
                            fontFamily: BODY_FONT,
                            fontSize: 12.5,
                            lineHeight: 1.55,
                            color: INK,
                          }}
                        >
                          <em style={{ fontFamily: DISPLAY, fontStyle: 'italic', color: CLARET }}>
                            Please bring
                          </em>{' '}
                          your AKC registration confirmation, vaccination records, and a copy of
                          this email. Armband{' '}
                          <strong style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
                            {runs[0].armband}
                          </strong>{' '}
                          will be issued at check-in.
                        </p>
                      )}
                    </td>
                  </tr>
                )}

                {/* ── ORNAMENT DIVIDER ── */}
                <tr>
                  <td style={{ padding: '24px 48px 8px', textAlign: 'center' }}>
                    <OrnamentRule color={GOLD} width={90} />
                  </td>
                </tr>

                {/* ── WITHDRAW / CONTACT ── */}
                <tr>
                  <td
                    style={{
                      padding: '4px 56px 12px',
                      fontFamily: BODY_FONT,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: INK,
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 10px',
                        textAlign: 'center',
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 13,
                        color: CLARET,
                        letterSpacing: '0.04em',
                      }}
                    >
                      § If you must withdraw
                    </p>
                    <p style={{ margin: '0 0 10px' }}>
                      Should circumstances prevent your attendance, kindly notify the Trial
                      Secretary in writing. Refunds (less $5 processing) are issued for written
                      withdrawals received before closing; entries withdrawn after closing cannot be
                      refunded but the slot will be released to the wait list.
                    </p>
                    <p style={{ margin: 0 }}>
                      For any other matter, please write to{' '}
                      {secretaryEmail ? (
                        <Link
                          href={`mailto:${secretaryEmail}`}
                          style={{ color: CLARET, textDecoration: 'none' }}
                        >
                          {secretaryEmail}
                        </Link>
                      ) : (
                        'the Trial Secretary'
                      )}
                      {secretaryPhone ? ` or telephone ${secretaryPhone}` : ''}.
                    </p>
                  </td>
                </tr>

                {/* ── CTA ── */}
                <tr>
                  <td align="center" style={{ padding: '16px 48px 32px' }}>
                    {trialUrl && (
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td style={{ background: INK, padding: '12px 28px' }}>
                            <Link
                              href={trialUrl}
                              style={{
                                fontFamily: DISPLAY,
                                fontStyle: 'italic',
                                fontSize: 15,
                                color: PAPER,
                                textDecoration: 'none',
                                letterSpacing: '0.06em',
                              }}
                            >
                              View trial particulars ›
                            </Link>
                          </td>
                        </tr>
                      </table>
                    )}
                    <p
                      style={{
                        margin: '14px 0 0',
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 11,
                        color: QUILL,
                      }}
                    >
                      Add to calendar · directions · order of running
                    </p>
                  </td>
                </tr>

                {/* ── SIGNATURE ── */}
                {(trialChairName || trialChairTitle) && (
                  <tr>
                    <td
                      style={{
                        padding: '0 56px 28px',
                        fontFamily: BODY_FONT,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: INK,
                      }}
                    >
                      <p style={{ margin: '0 0 6px' }}>
                        We look forward to seeing you and {dogCallName ?? dogRegisteredName} at the
                        trial.
                      </p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontSize: 18,
                            color: INK,
                          }}
                        >
                          — {trialChairName}
                        </p>
                      )}
                      {trialChairTitle && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: BODY_FONT,
                            fontSize: 12,
                            color: QUILL,
                            fontStyle: 'italic',
                          }}
                        >
                          {trialChairTitle}
                        </p>
                      )}
                    </td>
                  </tr>
                )}

                {/* ── FOOTER ── */}
                <tr>
                  <td style={{ background: INK, padding: '24px 48px', textAlign: 'center' }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY,
                        fontWeight: 600,
                        fontSize: 14,
                        textTransform: 'uppercase',
                        letterSpacing: '0.18em',
                        color: PAPER,
                      }}
                    >
                      {clubName}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontFamily: BODY_FONT,
                        fontStyle: 'italic',
                        fontSize: 11,
                        color: 'rgba(248,244,234,0.7)',
                      }}
                    >
                      {memberClubLanguage}
                    </p>
                    <p
                      style={{
                        margin: '16px 0 0',
                        fontFamily: BODY_FONT,
                        fontSize: 10.5,
                        lineHeight: 1.55,
                        color: 'rgba(248,244,234,0.55)',
                      }}
                    >
                      You received this confirmation because you submitted an entry.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </Body>
    </Html>
  );
}
