import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { FieldGuideConfirmationProps, FieldGuideRunRow } from '../types';
import { FG } from '../fieldGuideTokens';

const { PAPER, PAPER_WARM, PAPER_DEEP, INK, SOFT, MUTE, HAIR, ORANGE, ORANGE_DEEP, DISPLAY, BODY, MONO } = FG;

// ─── Runs table ──────────────────────────────────────────────────────────────
// Mono headers, alternating-row backgrounds, ORANGE_DEEP folio + armband
// digits. Mirrors the design mock's §01 detail block.
function RunsTable({ runs }: { runs: FieldGuideRunRow[] }) {
  const headers = ['TRIAL', 'DAY', 'CLASS', 'JUDGE', '№'];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        {headers.map((h, i) => (
          <td
            key={h}
            style={{
              padding: '8px 12px',
              background: PAPER_WARM,
              borderBottom: `1px solid ${INK}`,
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
        const altBg = i % 2 === 1 ? { background: PAPER_WARM } : {};
        return (
          <tr key={`${r.trialNumeral}-${i}`} style={altBg}>
            <td
              style={{
                padding: '10px 12px',
                borderBottom: border,
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: 13,
                color: ORANGE_DEEP,
              }}
            >
              {r.trialNumeral}
            </td>
            <td
              style={{
                padding: '10px 12px',
                borderBottom: border,
                fontFamily: MONO,
                fontSize: 12,
                color: INK,
              }}
            >
              {r.dayLabel}
            </td>
            <td
              style={{
                padding: '10px 12px',
                borderBottom: border,
                fontFamily: BODY,
                fontSize: 13,
                color: INK,
              }}
            >
              {r.classLabel}
            </td>
            <td
              style={{
                padding: '10px 12px',
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
                padding: '10px 12px',
                borderBottom: border,
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 16,
                color: ORANGE_DEEP,
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
function InfoCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        <td style={{ paddingBottom: 12 }}>
          <p
            style={{
              margin: 0,
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontFamily: BODY,
              fontSize: 14,
              lineHeight: 1.55,
              color: SOFT,
              whiteSpace: 'pre-line',
            }}
          >
            {value}
          </p>
        </td>
      </tr>
    </table>
  );
}

export function FieldGuideConfirmationEmail(props: FieldGuideConfirmationProps): JSX.Element {
  const {
    showCode,
    clubName,
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
    armbandNumber,
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
  } = props;

  const dogLine = [dogCallName ? `"${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  const clubByline = [clubCity].filter(Boolean).join(' · ');

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Entry confirmed — ${showTitle}`}</Preview>
      <Body style={{ margin: 0, padding: 0, background: '#dcd5b9' }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: '#dcd5b9', padding: '32px 0' }}
        >
          <tr>
            <td align="center">
              <table
                role="presentation"
                width={600}
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ width: 600, maxWidth: 600, background: PAPER }}
              >
                {/* ── TOP ID BAR ── */}
                <tr>
                  <td
                    style={{
                      background: PAPER_DEEP,
                      color: PAPER,
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
                          <span style={{ color: ORANGE, fontWeight: 600 }}>{showCode}</span> ·
                          CONFIRMATION · REV 01
                        </td>
                        <td align="right">
                          {receiptNumber && <span>RECEIPT {receiptNumber}</span>}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── HEADER (chip row + title) ── */}
                <tr>
                  <td style={{ padding: '28px 32px 22px', borderBottom: `2px solid ${INK}` }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ marginBottom: 14 }}>
                      <tr>
                        <td
                          style={{
                            background: ORANGE,
                            color: PAPER,
                            padding: '3px 8px',
                            fontFamily: MONO,
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: '0.04em',
                          }}
                        >
                          CONFIRMED
                        </td>
                        <td
                          style={{
                            paddingLeft: 8,
                            fontFamily: MONO,
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: '0.04em',
                            color: MUTE,
                          }}
                        >
                          {runCount} {runCount === 1 ? 'RUN' : 'RUNS'}
                          {armbandNumber ? (
                            <>
                              {' '}· ARMBAND <strong style={{ color: ORANGE_DEEP, fontWeight: 600 }}>#{armbandNumber}</strong>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    </table>
                    <h1
                      style={{
                        margin: '0 0 10px',
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 34,
                        letterSpacing: '-0.025em',
                        lineHeight: 1.05,
                        color: INK,
                      }}
                    >
                      Entry confirmed.
                    </h1>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: MONO,
                        fontWeight: 500,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: ORANGE_DEEP,
                        textTransform: 'uppercase',
                      }}
                    >
                      {showTitle}
                      {clubByline ? ` · ${clubByline}` : ''} · {dateRange}
                    </p>
                  </td>
                </tr>

                {/* ── GREETING ── */}
                <tr>
                  <td
                    style={{
                      padding: '24px 32px 8px',
                      fontFamily: BODY,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: SOFT,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      Hi <strong style={{ color: INK, fontWeight: 600 }}>{salutation}</strong>,
                    </p>
                    <p style={{ margin: '14px 0 0' }}>
                      Entry recorded. Spec below — dog, runs, armband, on-the-day reference. Bring
                      this email to check-in or write the number on a slip.
                    </p>
                  </td>
                </tr>

                {/* ── §01 THE DOG ── */}
                <tr>
                  <td style={{ padding: '24px 32px 0' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{
                        borderTop: `2px solid ${INK}`,
                        borderBottom: `2px solid ${INK}`,
                      }}
                    >
                      <tr>
                        <td
                          style={{
                            padding: '14px 0 6px',
                            fontFamily: MONO,
                            fontWeight: 600,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: ORANGE_DEEP,
                          }}
                        >
                          §01 · THE DOG
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={{
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: 22,
                            letterSpacing: '-0.02em',
                            color: INK,
                            lineHeight: 1.15,
                          }}
                        >
                          {dogRegisteredName}
                        </td>
                      </tr>
                      {dogLine && (
                        <tr>
                          <td
                            style={{
                              padding: '6px 0 16px',
                              fontFamily: MONO,
                              fontWeight: 500,
                              fontSize: 11,
                              letterSpacing: '0.04em',
                              color: MUTE,
                              textTransform: 'uppercase',
                            }}
                          >
                            {dogLine}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '8px 0 0' }}>
                          <RunsTable runs={runs} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '14px 0 16px' }}>
                          <p
                            style={{
                              margin: 0,
                              fontFamily: MONO,
                              fontWeight: 600,
                              fontSize: 11,
                              letterSpacing: '0.04em',
                              color: INK,
                            }}
                          >
                            {runCount} {runCount === 1 ? 'RUN' : 'RUNS'} · TOTAL{' '}
                            <span style={{ color: ORANGE_DEEP }}>{totalFeesFormatted}</span>
                            {receiptNumber ? ` · RECEIPT ${receiptNumber}` : ''}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── §02 ON THE DAY ── */}
                <tr>
                  <td style={{ padding: '32px 32px 0' }}>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: ORANGE_DEEP,
                        marginBottom: 8,
                      }}
                    >
                      §02 · ON THE DAY
                    </div>
                    <h2
                      style={{
                        margin: '0 0 24px',
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 26,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.1,
                        color: INK,
                      }}
                    >
                      Be on site early.
                    </h2>

                    <InfoCell label="Doors open" value={doorsTime} />
                    <InfoCell label="First class" value={firstClassTime} />
                    <InfoCell label="Venue" value={venueNameAndAddress} />
                    <InfoCell label="Parking" value={parkingNotes} />
                    <InfoCell label="Hospitality" value={hospitalityNotes} />
                    <InfoCell label="Crating" value={cratingNotes} />
                  </td>
                </tr>

                {/* ── §03 WITHDRAW ── */}
                <tr>
                  <td style={{ padding: '32px 32px 0' }}>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontWeight: 600,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: ORANGE_DEEP,
                        marginBottom: 8,
                      }}
                    >
                      §03 · WITHDRAW
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: BODY,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: SOFT,
                      }}
                    >
                      Draw is set. Refunds no longer available. Please notify the secretary if you
                      cannot attend so we can release your slot
                      {secretaryEmail ? (
                        <>
                          {' '}—{' '}
                          <Link
                            href={`mailto:${secretaryEmail}`}
                            style={{ color: ORANGE_DEEP, fontWeight: 600 }}
                          >
                            {secretaryEmail}
                          </Link>
                        </>
                      ) : null}
                      {secretaryPhone ? ` · ${secretaryPhone}` : ''}.
                    </p>
                  </td>
                </tr>

                {/* ── CTA ── */}
                {trialUrl && (
                  <tr>
                    <td style={{ padding: '28px 32px 0' }}>
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td style={{ background: ORANGE }}>
                            <Link
                              href={trialUrl}
                              style={{
                                display: 'inline-block',
                                padding: '14px 28px',
                                fontFamily: DISPLAY,
                                fontWeight: 700,
                                fontSize: 13,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: PAPER,
                                textDecoration: 'none',
                              }}
                            >
                              View trial particulars →
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
                        padding: '32px 32px 8px',
                        fontFamily: BODY,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: SOFT,
                      }}
                    >
                      <p style={{ margin: '0 0 14px' }}>See you ringside,</p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: 18,
                            letterSpacing: '-0.015em',
                            color: INK,
                          }}
                        >
                          {trialChairName}
                        </p>
                      )}
                      {trialChairTitle && (
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontFamily: MONO,
                            fontWeight: 500,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: ORANGE_DEEP,
                            textTransform: 'uppercase',
                          }}
                        >
                          {trialChairTitle}
                        </p>
                      )}
                    </td>
                  </tr>
                )}

                {/* ── FOOTER (dark band) ── */}
                <tr>
                  <td
                    style={{
                      padding: '28px 32px',
                      background: PAPER_DEEP,
                      color: PAPER,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: DISPLAY,
                        fontWeight: 700,
                        fontSize: 20,
                        letterSpacing: '-0.015em',
                        color: PAPER,
                        marginBottom: 6,
                      }}
                    >
                      {clubName}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: 'rgba(246,241,230,0.7)',
                        marginBottom: 20,
                      }}
                    >
                      {memberClubLanguage}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: '0.04em',
                        color: 'rgba(246,241,230,0.5)',
                        paddingTop: 18,
                        borderTop: '1px solid rgba(246,241,230,0.18)',
                        lineHeight: 1.7,
                      }}
                    >
                      YOU RECEIVED THIS BECAUSE YOU SUBMITTED AN ENTRY · {showCode}
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
