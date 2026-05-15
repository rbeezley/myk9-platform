import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { MonogramConfirmationProps, MonogramRunRow } from '../types';
import { MG } from '../monogramTokens';

const { INK, PAPER, PAPER_DEEP, BRONZE, QUILL, MUTE, MONOGRAM, DISPLAY } = MG;
const BODY_FONT = MG.BODY;

// ─── Ornament rule (email-safe div line-trick, not border) ──────────────────
// Outlook strips borders on inline elements but respects background-color on
// div. Mirrors the Heritage convention.
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
        <td
          style={{
            width,
            verticalAlign: 'middle',
            fontSize: 0,
            lineHeight: 0,
          }}
        >
          <div
            style={{
              width,
              height: 1,
              background: color,
              fontSize: 0,
              lineHeight: 0,
            }}
          >
            &nbsp;
          </div>
        </td>
        <td
          style={{
            padding: '0 10px',
            fontFamily: MONOGRAM,
            fontSize: 14,
            lineHeight: 1,
            color: BRONZE,
            verticalAlign: 'middle',
          }}
        >
          ◆
        </td>
        <td
          style={{
            width,
            verticalAlign: 'middle',
            fontSize: 0,
            lineHeight: 0,
          }}
        >
          <div
            style={{
              width,
              height: 1,
              background: color,
              fontSize: 0,
              lineHeight: 0,
            }}
          >
            &nbsp;
          </div>
        </td>
      </tr>
    </table>
  );
}

// ─── Runs table (one row per trial, like a betting ticket) ──────────────────
function RunsTable({ runs }: { runs: MonogramRunRow[] }) {
  const headers = ['Trial', 'Day', 'Class', 'Judge', 'Armband'];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        {headers.map((h, i) => (
          <td
            key={h}
            style={{
              padding: '8px 0',
              borderBottom: `1px solid ${BRONZE}`,
              fontFamily: DISPLAY,
              fontSize: 10.5,
              letterSpacing: '0.12em',
              color: QUILL,
              textTransform: 'uppercase',
              textAlign: i === 4 ? 'right' : 'left',
            }}
          >
            {h}
          </td>
        ))}
      </tr>
      {runs.map((run, i) => {
        const isLast = i === runs.length - 1;
        const cellBase: React.CSSProperties = {
          padding: '8px 0',
          borderBottom: isLast ? undefined : `1px dotted ${MUTE}`,
        };
        return (
          <tr key={run.trialNumeral}>
            <td
              style={{
                ...cellBase,
                fontFamily: MONOGRAM,
                fontStyle: 'italic',
                color: BRONZE,
                fontSize: 14,
              }}
            >
              {run.trialNumeral}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13, color: INK }}>
              {run.dayLabel}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13, color: INK }}>
              {run.classLabel}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13, color: INK }}>
              {run.judgeName}
            </td>
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

// ─── On-the-day info cell ────────────────────────────────────────────────────
function InfoCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <p style={{ margin: 0, fontFamily: DISPLAY, fontStyle: 'italic', color: QUILL, fontSize: 12 }}>
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

// ─── Main component ──────────────────────────────────────────────────────────
export function MonogramConfirmationEmail({
  monogramLetters,
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
}: MonogramConfirmationProps): JSX.Element {
  const dogLine = [dogCallName ? `called "${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  const clubByline = [clubEstablished ? `Est. ${clubEstablished}` : null, clubCity]
    .filter(Boolean)
    .join(' · ');

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Italiana&family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Crimson+Pro:ital,wght@0,400;0,500;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Your entry to ${showTitle} is confirmed — ${salutation}`}</Preview>

      <Body style={{ margin: 0, padding: 0, background: PAPER_DEEP }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: PAPER_DEEP, padding: '32px 0' }}
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
                {/* ── HEADER: monogram + club ── */}
                <tr>
                  <td align="center" style={{ padding: '48px 48px 16px' }}>
                    {/* Solid-ink monogram letters. NOT embossed — Outlook strips
                        background-clip:text, the web landing page uses the
                        embossed treatment instead. */}
                    <div
                      style={{
                        fontFamily: MONOGRAM,
                        fontSize: 84,
                        lineHeight: 1,
                        color: INK,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {monogramLetters}
                    </div>
                    <p
                      style={{
                        margin: '14px 0 4px',
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 20,
                        color: INK,
                      }}
                    >
                      {clubName}
                    </p>
                    {clubByline && (
                      <p
                        style={{
                          margin: 0,
                          fontFamily: DISPLAY,
                          fontSize: 10.5,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: MUTE,
                        }}
                      >
                        {clubByline}
                      </p>
                    )}
                  </td>
                </tr>

                {/* ── ORNAMENT ── */}
                <tr>
                  <td align="center" style={{ padding: '8px 48px 16px' }}>
                    <OrnamentRule color={BRONZE} width={90} />
                  </td>
                </tr>

                {/* ── SHOW TITLE + DATE ── */}
                <tr>
                  <td align="center" style={{ padding: '0 48px 24px' }}>
                    <h1
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY,
                        fontWeight: 500,
                        fontSize: 28,
                        color: INK,
                        lineHeight: 1.15,
                      }}
                    >
                      {showTitle}
                    </h1>
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontSize: 15,
                        color: QUILL,
                      }}
                    >
                      {dateRange}
                    </p>
                  </td>
                </tr>

                {/* ── GREETING ── */}
                <tr>
                  <td
                    style={{
                      padding: '8px 56px 6px',
                      fontFamily: BODY_FONT,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: INK,
                    }}
                  >
                    <p style={{ margin: '0 0 12px' }}>
                      Dear{' '}
                      <em style={{ fontFamily: DISPLAY, fontStyle: 'italic', color: BRONZE }}>
                        {salutation}
                      </em>
                      ,
                    </p>
                    <p style={{ margin: '0 0 12px' }}>
                      Your entry to{' '}
                      <em style={{ fontFamily: DISPLAY, fontStyle: 'italic' }}>{showTitle}</em> is
                      confirmed. The draw is set and your particulars are recorded as follows.
                    </p>
                  </td>
                </tr>

                {/* ── ENTRY DETAIL CARD ── */}
                <tr>
                  <td style={{ padding: '8px 56px 24px' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{
                        background: PAPER_DEEP,
                        border: `1px solid ${BRONZE}`,
                        borderRadius: 2,
                      }}
                    >
                      <tr>
                        <td style={{ padding: '20px 24px 12px' }}>
                          <p
                            style={{
                              margin: 0,
                              fontFamily: DISPLAY,
                              fontStyle: 'italic',
                              fontSize: 12,
                              color: QUILL,
                            }}
                          >
                            Entry of
                          </p>
                          <p
                            style={{
                              margin: '2px 0 0',
                              fontFamily: DISPLAY,
                              fontWeight: 500,
                              fontSize: 22,
                              color: INK,
                              lineHeight: 1.2,
                            }}
                          >
                            {dogRegisteredName}
                          </p>
                          {dogLine && (
                            <p
                              style={{
                                margin: '4px 0 0',
                                fontFamily: BODY_FONT,
                                fontStyle: 'italic',
                                fontSize: 13,
                                color: QUILL,
                              }}
                            >
                              {dogLine}
                            </p>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0 24px 16px' }}>
                          <RunsTable runs={runs} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0 24px 20px' }}>
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
                                  fontFamily: DISPLAY,
                                  fontStyle: 'italic',
                                  fontSize: 12,
                                  color: QUILL,
                                }}
                              >
                                {runCount} {runCount === 1 ? 'run' : 'runs'}
                                {receiptNumber ? ` · ${receiptNumber}` : ''}
                              </td>
                              <td
                                style={{
                                  fontFamily: DISPLAY,
                                  fontSize: 18,
                                  color: BRONZE,
                                  textAlign: 'right',
                                }}
                              >
                                {totalFeesFormatted}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                {/* ── ON THE DAY ── */}
                <tr>
                  <td style={{ padding: '8px 56px 8px' }}>
                    <h2
                      style={{
                        margin: '0 0 8px',
                        fontFamily: DISPLAY,
                        fontWeight: 500,
                        fontSize: 18,
                        color: INK,
                      }}
                    >
                      On the day
                    </h2>
                    <InfoCell label="Doors open" value={doorsTime} />
                    <InfoCell label="First class" value={firstClassTime} />
                    <InfoCell label="Venue" value={venueNameAndAddress} />
                    <InfoCell label="Parking" value={parkingNotes} />
                    <InfoCell label="Hospitality" value={hospitalityNotes} />
                    <InfoCell label="Crating" value={cratingNotes} />
                  </td>
                </tr>

                {/* ── ORNAMENT ── */}
                <tr>
                  <td align="center" style={{ padding: '16px 48px 8px' }}>
                    <OrnamentRule color={BRONZE} width={90} />
                  </td>
                </tr>

                {/* ── WITHDRAW / CONTACT ── */}
                <tr>
                  <td
                    style={{
                      padding: '4px 56px 16px',
                      fontFamily: BODY_FONT,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: INK,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      To withdraw or amend your entry, please contact the trial secretary
                      {secretaryEmail ? (
                        <>
                          {' at '}
                          <Link
                            href={`mailto:${secretaryEmail}`}
                            style={{ color: BRONZE, textDecoration: 'none' }}
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
                    <td align="center" style={{ padding: '0 48px 24px' }}>
                      <Link
                        href={trialUrl}
                        style={{
                          display: 'inline-block',
                          padding: '12px 28px',
                          background: INK,
                          color: PAPER,
                          fontFamily: DISPLAY,
                          fontSize: 12,
                          letterSpacing: '0.2em',
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                          borderRadius: 1,
                        }}
                      >
                        View trial particulars
                      </Link>
                    </td>
                  </tr>
                )}

                {/* ── SIGNATURE ── */}
                {(trialChairName || trialChairTitle) && (
                  <tr>
                    <td
                      style={{
                        padding: '8px 56px 24px',
                        fontFamily: BODY_FONT,
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: INK,
                      }}
                    >
                      <p style={{ margin: 0 }}>Most sincerely,</p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: '6px 0 0',
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontSize: 16,
                            color: BRONZE,
                          }}
                        >
                          {trialChairName}
                        </p>
                      )}
                      {trialChairTitle && (
                        <p
                          style={{
                            margin: '0',
                            fontFamily: DISPLAY,
                            fontSize: 10.5,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: MUTE,
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
                  <td
                    style={{
                      padding: '24px 56px 36px',
                      background: INK,
                      color: 'rgba(243,238,228,0.7)',
                      fontFamily: BODY_FONT,
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    <p style={{ margin: 0 }}>{memberClubLanguage}</p>
                    <p
                      style={{
                        margin: '12px 0 0',
                        fontSize: 10.5,
                        color: 'rgba(243,238,228,0.55)',
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
