import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { PosterConfirmationProps, PosterRunRow } from '../types';
import { PO } from '../posterTokens';

const { CREAM, INK, INK_SOFT, MUTE, HAIR, RED, DISPLAY, DISPLAY_TIGHT, BODY, MONO } = PO;

// ─── Runs table ──────────────────────────────────────────────────────────────
// Tabular, hairline-bordered, with red trial numerals and red armband numbers
// in Archivo Black (Inter Tight fallback). Mono header row.
function RunsTable({ runs }: { runs: PosterRunRow[] }) {
  const headers = ['Trial', 'Day', 'Class', 'Judge', '№'];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        {headers.map((h, i) => (
          <td
            key={h}
            style={{
              padding: '8px 0',
              borderBottom: `1px solid ${HAIR}`,
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: '0.04em',
              color: MUTE,
              textTransform: 'uppercase',
              textAlign: i === 4 ? 'right' : 'left',
            }}
          >
            {h}
          </td>
        ))}
      </tr>
      {runs.map((r, i) => {
        const last = i === runs.length - 1;
        const border = last ? 'none' : `1px solid ${HAIR}`;
        return (
          <tr key={`${r.trialNumeral}-${i}`}>
            <td
              style={{
                padding: '12px 0',
                borderBottom: border,
                fontFamily: DISPLAY,
                fontSize: 18,
                letterSpacing: '-0.03em',
                color: RED,
              }}
            >
              {r.trialNumeral}
            </td>
            <td
              style={{
                padding: '12px 8px',
                borderBottom: border,
                fontFamily: DISPLAY_TIGHT,
                fontWeight: 700,
                fontSize: 13,
                color: INK,
              }}
            >
              {r.dayLabel}
            </td>
            <td
              style={{
                padding: '12px 8px',
                borderBottom: border,
                fontFamily: DISPLAY_TIGHT,
                fontWeight: 700,
                fontSize: 13,
                color: INK,
              }}
            >
              {r.classLabel}
            </td>
            <td
              style={{
                padding: '12px 8px',
                borderBottom: border,
                fontFamily: BODY,
                fontSize: 13,
                color: INK,
              }}
            >
              {r.judgeName}
            </td>
            <td
              style={{
                padding: '12px 0 12px 8px',
                borderBottom: border,
                fontFamily: DISPLAY,
                fontSize: 20,
                letterSpacing: '-0.03em',
                color: RED,
                textAlign: 'right',
              }}
            >
              {r.armband ?? '—'}
            </td>
          </tr>
        );
      })}
    </table>
  );
}

// ─── On-the-day cell ────────────────────────────────────────────────────────
function DayCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <td
      width="50%"
      style={{
        padding: '14px 16px',
        borderRight: `1px solid rgba(243,237,224,0.18)`,
        borderBottom: `1px solid rgba(243,237,224,0.18)`,
        verticalAlign: 'top',
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: '0.04em',
          color: 'rgba(243,237,224,0.6)',
          marginBottom: 4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 22,
          letterSpacing: '-0.03em',
          color: CREAM,
        }}
      >
        {value}
      </div>
    </td>
  );
}

export function PosterConfirmationEmail(props: PosterConfirmationProps): JSX.Element {
  const {
    clubName,
    clubCity,
    showTitle,
    dateRange,
    showAbbreviation,
    salutation,
    armband,
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
    trialUrl,
    trialChairName,
    trialChairTitle,
    memberClubLanguage,
    licenseLanguage,
  } = props;

  const dogLine = [dogCallName ? `"${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter+Tight:wght@500;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Confirmed — ${showTitle}${armband ? ` · armband ${armband}` : ''}`}</Preview>
      <Body style={{ margin: 0, padding: 0, background: CREAM }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: CREAM, padding: '24px 0' }}
        >
          <tr>
            <td align="center">
              <table
                role="presentation"
                width={600}
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ width: 600, maxWidth: 600, background: CREAM }}
              >
                {/* ── TOP MONO STRIP ── */}
                <tr>
                  <td
                    style={{
                      background: INK,
                      color: CREAM,
                      padding: '10px 32px',
                      fontFamily: MONO,
                      fontWeight: 500,
                      fontSize: 11,
                      letterSpacing: '0.04em',
                    }}
                  >
                    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                      <tr>
                        <td align="left">
                          CONFIRMED <span style={{ color: RED }}>●</span>{' '}
                          {showAbbreviation ? showAbbreviation.toUpperCase() : 'TRIAL'}
                        </td>
                        <td align="right">
                          {trialUrl && (
                            <Link
                              href={trialUrl}
                              style={{ color: CREAM, textDecoration: 'none' }}
                            >
                              VIEW IN BROWSER
                            </Link>
                          )}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── HERO HEADLINE ── */}
                <tr>
                  <td
                    style={{
                      padding: '36px 32px 24px',
                      borderBottom: `2px solid ${INK}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: RED,
                        marginBottom: 16,
                      }}
                    >
                      NO 01 / CONFIRMATION
                    </div>
                    <h1
                      style={{
                        margin: '0 0 14px',
                        fontFamily: DISPLAY,
                        fontSize: 48,
                        letterSpacing: '-0.045em',
                        lineHeight: 0.85,
                        color: INK,
                      }}
                    >
                      You&apos;re <span style={{ color: RED }}>in.</span>
                      {armband && (
                        <>
                          <br />
                          Armband <span style={{ color: RED }}>{armband}.</span>
                        </>
                      )}
                    </h1>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY_TIGHT,
                        fontWeight: 800,
                        fontSize: 16,
                        letterSpacing: '-0.01em',
                        lineHeight: 1.4,
                        color: INK_SOFT,
                      }}
                    >
                      {showTitle} · {dateRange}
                      {clubCity ? ` · ${clubCity}` : ''}
                    </p>
                  </td>
                </tr>

                {/* ── GREETING ── */}
                <tr>
                  <td
                    style={{
                      padding: '28px 32px 8px',
                      fontFamily: BODY,
                      fontSize: 16,
                      lineHeight: 1.65,
                      color: INK_SOFT,
                    }}
                  >
                    <p style={{ margin: '0 0 14px' }}>
                      Hi <strong style={{ color: INK }}>{salutation}</strong>,
                    </p>
                    <p style={{ margin: 0 }}>
                      Your entry is recorded. Below: the dog, the runs
                      {armband ? ', the armband' : ''}. See you on trial day.
                    </p>
                  </td>
                </tr>

                {/* ── DETAIL CARD ── */}
                <tr>
                  <td style={{ padding: '28px 32px 0' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{ borderTop: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }}
                    >
                      <tr>
                        <td
                          style={{
                            padding: '18px 0 8px',
                            fontFamily: MONO,
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: RED,
                          }}
                        >
                          NO 02 / THE DOG
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={{
                            fontFamily: DISPLAY,
                            fontSize: 26,
                            letterSpacing: '-0.035em',
                            color: INK,
                            lineHeight: 0.95,
                          }}
                        >
                          {dogRegisteredName.toUpperCase()}
                        </td>
                      </tr>
                      {dogLine && (
                        <tr>
                          <td
                            style={{
                              padding: '10px 0 18px',
                              fontFamily: MONO,
                              fontWeight: 500,
                              fontSize: 11,
                              letterSpacing: '0.04em',
                              color: MUTE,
                            }}
                          >
                            {dogLine}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '8px 0 0', borderTop: `1px solid ${HAIR}` }}>
                          <RunsTable runs={runs} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '14px 0 18px', borderTop: `1px solid ${HAIR}` }}>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontWeight: 600,
                              fontSize: 11,
                              letterSpacing: '0.04em',
                              color: INK,
                            }}
                          >
                            {runCount} {runCount === 1 ? 'RUN' : 'RUNS'} · TOTAL{' '}
                            {totalFeesFormatted}
                            {receiptNumber ? ` · RECEIPT ${receiptNumber}` : ''}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── ON THE DAY (DARK BAND) ── */}
                {(doorsTime || firstClassTime || venueNameAndAddress || parkingNotes ||
                  hospitalityNotes || cratingNotes) && (
                  <tr>
                    <td style={{ padding: '36px 32px 0' }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          color: RED,
                          marginBottom: 10,
                        }}
                      >
                        NO 03 / ON THE DAY
                      </div>
                      <h2
                        style={{
                          margin: '0 0 24px',
                          fontFamily: DISPLAY,
                          fontSize: 36,
                          letterSpacing: '-0.04em',
                          lineHeight: 0.9,
                          color: INK,
                        }}
                      >
                        {firstClassTime ? (
                          <>
                            Be on site by{' '}
                            <span style={{ color: RED }}>
                              {firstClassTime.split(/\s+/)[0]}.
                            </span>
                          </>
                        ) : (
                          <>
                            Doors <span style={{ color: RED }}>open.</span>
                          </>
                        )}
                      </h2>

                      <table
                        role="presentation"
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        style={{ background: INK, color: CREAM }}
                      >
                        <tr>
                          <DayCell label="Doors" value={doorsTime} />
                          <DayCell label="First class" value={firstClassTime} />
                        </tr>
                        <tr>
                          <DayCell label="Crating" value={cratingNotes} />
                          <DayCell label="Parking" value={parkingNotes} />
                        </tr>
                        <tr>
                          <DayCell label="Hospitality" value={hospitalityNotes} />
                          <DayCell label="Venue" value={venueNameAndAddress} />
                        </tr>
                      </table>
                    </td>
                  </tr>
                )}

                {/* ── WITHDRAW ── */}
                {secretaryEmail && (
                  <tr>
                    <td style={{ padding: '36px 32px 0' }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          color: RED,
                          marginBottom: 10,
                        }}
                      >
                        NO 04 / IF YOU MUST WITHDRAW
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: BODY,
                          fontSize: 15,
                          lineHeight: 1.65,
                          color: INK_SOFT,
                        }}
                      >
                        Please notify the secretary as soon as possible if you cannot attend, so
                        we can release your slot. Email{' '}
                        <Link
                          href={`mailto:${secretaryEmail}`}
                          style={{ color: RED, fontWeight: 600, textDecoration: 'none' }}
                        >
                          {secretaryEmail}
                        </Link>
                        .
                      </p>
                    </td>
                  </tr>
                )}

                {/* ── CTA ── */}
                {trialUrl && (
                  <tr>
                    <td style={{ padding: '28px 32px 0' }}>
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td style={{ background: RED }}>
                            <Link
                              href={trialUrl}
                              style={{
                                display: 'inline-block',
                                padding: '18px 32px',
                                fontFamily: DISPLAY,
                                fontSize: 18,
                                letterSpacing: '-0.02em',
                                color: CREAM,
                                textDecoration: 'none',
                              }}
                            >
                              VIEW TRIAL PARTICULARS →
                            </Link>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                )}

                {/* ── SIGNOFF ── */}
                {(trialChairName || trialChairTitle) && (
                  <tr>
                    <td
                      style={{
                        padding: '36px 32px 8px',
                        fontFamily: BODY,
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: INK_SOFT,
                      }}
                    >
                      <p style={{ margin: '0 0 18px' }}>See you on trial day,</p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: DISPLAY,
                            fontSize: 24,
                            letterSpacing: '-0.035em',
                            color: INK,
                          }}
                        >
                          {trialChairName.toUpperCase()}.
                        </p>
                      )}
                      {trialChairTitle && (
                        <p
                          style={{
                            margin: '6px 0 0',
                            fontFamily: MONO,
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: RED,
                          }}
                        >
                          {trialChairTitle.toUpperCase()}
                        </p>
                      )}
                    </td>
                  </tr>
                )}

                {/* ── FOOTER ── */}
                <tr>
                  <td
                    style={{
                      padding: '36px 32px',
                      background: INK,
                      color: CREAM,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: DISPLAY,
                        fontSize: 24,
                        letterSpacing: '-0.03em',
                        color: CREAM,
                        marginBottom: 6,
                      }}
                    >
                      {(clubName || 'Kennel Club').toUpperCase()}.
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: 'rgba(243,237,224,0.65)',
                        marginBottom: 24,
                      }}
                    >
                      {memberClubLanguage}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        color: 'rgba(243,237,224,0.5)',
                        paddingTop: 18,
                        borderTop: '1px solid rgba(243,237,224,0.18)',
                        lineHeight: 1.7,
                      }}
                    >
                      You received this confirmation because you submitted an entry.
                      <br />
                      {licenseLanguage}
                    </div>
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
