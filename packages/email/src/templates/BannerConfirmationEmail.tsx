import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { BannerConfirmationProps, BannerRunRow } from '../types';
import { BN } from '../bannerTokens';

const { PAPER, INK, SOFT, MUTE, HAIR, DISPLAY, BODY } = BN;

// ─── Runs table ──────────────────────────────────────────────────────────────
// Tabular, hairline-bordered, monolithic. Matches the Banner visual register —
// no italics, no diamond ornaments, no centered headers.
function RunsTable({ runs, flag }: { runs: BannerRunRow[]; flag: string }) {
  const headers = ['Trial', 'Day', 'Class', 'Judge', 'Armband'];
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        {headers.map((h, i) => (
          <td
            key={h}
            style={{
              padding: '8px 0',
              borderBottom: `2px solid ${flag}`,
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.2em',
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
                padding: '10px 0',
                borderBottom: border,
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: '0.1em',
                color: flag,
              }}
            >
              {r.trialNumeral}
            </td>
            <td
              style={{
                padding: '10px 0',
                borderBottom: border,
                fontFamily: BODY,
                fontSize: 13,
                color: INK,
              }}
            >
              {r.dayLabel}
            </td>
            <td
              style={{
                padding: '10px 0',
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
                padding: '10px 0',
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
                padding: '10px 0',
                borderBottom: border,
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: '-0.02em',
                color: INK,
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

// ─── Info cell — used for the on-the-day block ──────────────────────────────
function InfoCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        <td
          style={{
            paddingBottom: 10,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: BODY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.2em',
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

export function BannerConfirmationEmail(props: BannerConfirmationProps): JSX.Element {
  const {
    brandColor,
    brandColorDeep,
    brandColorBright,
    textOnFlag,
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Confirmed — ${showTitle}`}</Preview>
      <Body style={{ margin: 0, padding: 0, background: PAPER }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: PAPER, padding: '24px 0' }}
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
                {/* ── FLAG MASTHEAD ── */}
                <tr>
                  <td
                    style={{
                      padding: '36px 36px 32px',
                      background: brandColor,
                      color: textOnFlag,
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 14px',
                        fontFamily: BODY,
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: '0.32em',
                        textTransform: 'uppercase',
                        color: textOnFlag,
                        opacity: 0.7,
                      }}
                    >
                      Confirmed{receiptNumber ? ` · ${receiptNumber}` : ''}
                    </p>
                    <h1
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 40,
                        letterSpacing: '-0.04em',
                        lineHeight: 0.95,
                        color: textOnFlag,
                      }}
                    >
                      You&apos;re in.
                    </h1>
                    <p
                      style={{
                        margin: '14px 0 0',
                        fontFamily: BODY,
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: textOnFlag,
                        opacity: 0.85,
                      }}
                    >
                      {showTitle}
                      <br />
                      {clubName}
                      {clubByline ? ` · ${clubByline}` : ''} · {dateRange}
                    </p>
                  </td>
                </tr>

                {/* ── GREETING ── */}
                <tr>
                  <td
                    style={{
                      padding: '32px 36px 4px',
                      fontFamily: BODY,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: INK,
                    }}
                  >
                    <p style={{ margin: 0 }}>{`Dear ${salutation},`}</p>
                    <p style={{ margin: '12px 0 0' }}>
                      Your entry is confirmed. The draw is set and your particulars are recorded
                      below.
                    </p>
                  </td>
                </tr>

                {/* ── ENTRY DETAIL CARD ── */}
                <tr>
                  <td style={{ padding: '20px 36px 24px' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{
                        borderTop: `2px solid ${brandColor}`,
                        borderBottom: `2px solid ${brandColor}`,
                      }}
                    >
                      <tr>
                        <td style={{ padding: '16px 0 8px' }}>
                          <p
                            style={{
                              margin: 0,
                              fontFamily: DISPLAY,
                              fontWeight: 900,
                              fontSize: 11,
                              letterSpacing: '0.2em',
                              color: brandColor,
                            }}
                          >
                            01 / THE DOG
                          </p>
                          <p
                            style={{
                              margin: '6px 0 0',
                              fontFamily: DISPLAY,
                              fontWeight: 800,
                              fontSize: 24,
                              letterSpacing: '-0.025em',
                              lineHeight: 1.1,
                              color: INK,
                            }}
                          >
                            {dogRegisteredName}
                          </p>
                          {dogLine && (
                            <p
                              style={{
                                margin: '6px 0 0',
                                fontFamily: BODY,
                                fontWeight: 500,
                                fontSize: 12,
                                letterSpacing: '0.08em',
                                color: MUTE,
                              }}
                            >
                              {dogLine}
                            </p>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '8px 0 16px' }}>
                          <RunsTable runs={runs} flag={brandColor} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ paddingBottom: 16 }}>
                          <table
                            role="presentation"
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            border={0}
                            style={{ borderTop: `1px solid ${HAIR}` }}
                          >
                            <tr>
                              <td
                                style={{
                                  paddingTop: 12,
                                  fontFamily: BODY,
                                  fontWeight: 500,
                                  fontSize: 10,
                                  letterSpacing: '0.28em',
                                  textTransform: 'uppercase',
                                  color: MUTE,
                                }}
                              >
                                {runCount} {runCount === 1 ? 'run' : 'runs'} · Fees received
                              </td>
                              <td
                                style={{
                                  paddingTop: 12,
                                  fontFamily: DISPLAY,
                                  fontWeight: 900,
                                  fontSize: 28,
                                  letterSpacing: '-0.035em',
                                  color: brandColor,
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
                  <td style={{ padding: '0 36px 8px' }}>
                    <h2
                      style={{
                        margin: '8px 0 16px',
                        fontFamily: DISPLAY,
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        color: brandColor,
                      }}
                    >
                      02 / ON THE DAY
                    </h2>
                    <InfoCell label="Doors open" value={doorsTime} />
                    <InfoCell label="First class" value={firstClassTime} />
                    <InfoCell label="Venue" value={venueNameAndAddress} />
                    <InfoCell label="Parking" value={parkingNotes} />
                    <InfoCell label="Hospitality" value={hospitalityNotes} />
                    <InfoCell label="Crating" value={cratingNotes} />
                  </td>
                </tr>

                {/* ── WITHDRAW / CONTACT ── */}
                <tr>
                  <td
                    style={{
                      padding: '12px 36px 8px',
                      fontFamily: BODY,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: SOFT,
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      To withdraw or amend your entry, please contact the trial secretary
                      {secretaryEmail ? (
                        <>
                          {' '}at{' '}
                          <Link
                            href={`mailto:${secretaryEmail}`}
                            style={{ color: brandColor, textDecoration: 'none' }}
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
                    <td align="left" style={{ padding: '12px 36px 32px' }}>
                      <Link
                        href={trialUrl}
                        style={{
                          display: 'inline-block',
                          padding: '14px 28px',
                          background: brandColor,
                          color: textOnFlag,
                          fontFamily: DISPLAY,
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: '0.04em',
                          textDecoration: 'none',
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
                        padding: '0 36px 24px',
                        fontFamily: BODY,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: SOFT,
                      }}
                    >
                      <p style={{ margin: 0 }}>Best,</p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: '6px 0 0',
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: 16,
                            color: INK,
                          }}
                        >
                          {trialChairName}
                        </p>
                      )}
                      {trialChairTitle && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: BODY,
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: '0.2em',
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

                {/* ── FINAL FLAG BAND (dark) ── */}
                <tr>
                  <td
                    style={{
                      padding: '32px 36px',
                      background: brandColorDeep,
                      color: PAPER,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 22,
                        letterSpacing: '-0.025em',
                        lineHeight: 1.15,
                        color: PAPER,
                      }}
                    >
                      See you{' '}
                      <span
                        style={{
                          color: brandColorBright,
                        }}
                      >
                        ringside
                      </span>
                      .
                    </p>
                    <p
                      style={{
                        margin: '10px 0 0',
                        fontFamily: BODY,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: PAPER,
                        opacity: 0.7,
                      }}
                    >
                      {memberClubLanguage}
                    </p>
                  </td>
                </tr>

                {/* ── FOOTER ── */}
                <tr>
                  <td
                    style={{
                      padding: '16px 36px 24px',
                      fontFamily: BODY,
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      color: MUTE,
                    }}
                  >
                    You received this confirmation because you submitted an entry.
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
