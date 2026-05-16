import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { GazetteConfirmationProps, GazetteRunRow } from '../types';
import { GZ } from '../gazetteTokens';

const { INK, PAPER, PAPER_WARM, BROWN, MUTE, HAIR, SOFT, DISPLAY, BODY: BODY_FONT, META } = GZ;

/**
 * Masthead "*The* Club *Gazette*" — three Text spans to get the italic
 * articles. Auto-wraps first and last words when clubName has ≥ 3 tokens,
 * matching the rule in the web masthead primitive.
 */
function MastheadTitle({ clubName, size = 36 }: { clubName: string; size?: number }) {
  const words = clubName.trim().split(/\s+/);
  if (words.length < 3) {
    return (
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontSize: size,
          letterSpacing: '-0.015em',
          lineHeight: 1,
          color: INK,
        }}
      >
        {clubName}
      </span>
    );
  }
  const first = words[0];
  const last = words[words.length - 1];
  const middle = words.slice(1, -1).join(' ');
  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '-0.015em',
        lineHeight: 1,
        color: INK,
      }}
    >
      <em style={{ fontStyle: 'italic', fontWeight: 400 }}>{first}</em>
      {` ${middle} `}
      <em style={{ fontStyle: 'italic', fontWeight: 400 }}>{last}</em>
    </span>
  );
}

function RunsTable({ runs }: { runs: GazetteRunRow[] }) {
  const headerCellBase = {
    paddingBottom: 6,
    borderBottom: `1px dotted ${HAIR}`,
    fontFamily: META,
    fontWeight: 500,
    fontSize: 9,
    color: MUTE,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
  };

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ marginTop: 6 }}
    >
      <tr>
        <th align="left" style={{ ...headerCellBase, padding: '10px 8px 8px 0' }}>
          Trial
        </th>
        <th align="left" style={{ ...headerCellBase, padding: '10px 8px 8px' }}>
          Day
        </th>
        <th align="left" style={{ ...headerCellBase, padding: '10px 8px 8px' }}>
          Class
        </th>
        <th align="left" style={{ ...headerCellBase, padding: '10px 8px 8px' }}>
          Judge
        </th>
        <th align="right" style={{ ...headerCellBase, padding: '10px 0 8px 8px' }}>
          №
        </th>
      </tr>
      {runs.map((run, i) => {
        const isLast = i === runs.length - 1;
        const cellBase: React.CSSProperties = {
          padding: '11px 8px',
          borderBottom: isLast ? undefined : `1px dotted ${HAIR}`,
          color: INK,
        };
        return (
          <tr key={run.trialNumeral}>
            <td
              style={{
                ...cellBase,
                paddingLeft: 0,
                fontFamily: DISPLAY,
                fontStyle: 'italic',
                fontWeight: 700,
                fontSize: 18,
                color: BROWN,
              }}
            >
              {run.trialNumeral.toLowerCase()}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13 }}>{run.dayLabel}</td>
            <td
              style={{
                ...cellBase,
                fontFamily: DISPLAY,
                fontSize: 14,
              }}
            >
              {run.classLabel}
            </td>
            <td style={{ ...cellBase, fontFamily: BODY_FONT, fontSize: 13 }}>{run.judgeName}</td>
            <td
              style={{
                ...cellBase,
                paddingRight: 0,
                textAlign: 'right',
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 20,
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

function InfoBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <p
        style={{
          margin: 0,
          fontFamily: META,
          fontWeight: 500,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: MUTE,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '4px 0 14px',
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: '-0.005em',
          color: INK,
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

/**
 * Gazette confirmation email. 600px broadsheet-style email body with
 * masthead, "Section A · The Dog" detail card, "Section B · On the Day"
 * info grid, "Section C · Notices" withdraw line, CTA, signoff, and
 * footer with double-rule top border.
 *
 * NOTE: body copy uses default lining figures (no
 * `font-feature-settings: "onum" 1`) because Outlook 2007–2019 ignores
 * the property — see README §Known Caveats. Acceptable degradation.
 */
export function GazetteConfirmationEmail({
  clubName,
  clubEstablished,
  showTitle,
  dateRange,
  editionLabel,
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
}: GazetteConfirmationProps): JSX.Element {
  const dogLine = [dogCallName ? `"${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Your entry to ${showTitle} is confirmed — ${salutation}`}</Preview>

      <Body style={{ margin: 0, padding: 0, background: '#d8ceb6' }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: '#d8ceb6', padding: '32px 0' }}
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
                {/* ── MASTHEAD STRIP ── */}
                {editionLabel && (
                  <tr>
                    <td style={{ padding: '16px 40px 8px', borderBottom: `1px solid ${HAIR}` }}>
                      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td
                            align="left"
                            style={{
                              fontFamily: META,
                              fontWeight: 500,
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              color: BROWN,
                            }}
                          >
                            {editionLabel}
                          </td>
                          <td
                            align="center"
                            style={{
                              fontFamily: META,
                              fontWeight: 500,
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              color: BROWN,
                            }}
                          >
                            TRIAL CONFIRMATION
                          </td>
                          <td
                            align="right"
                            style={{
                              fontFamily: META,
                              fontWeight: 500,
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              color: BROWN,
                            }}
                          >
                            {dateRange.toUpperCase()}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                )}

                {/* ── MASTHEAD TITLE ── */}
                <tr>
                  <td
                    align="center"
                    style={{ padding: '20px 40px 12px', borderBottom: `4px double ${INK}` }}
                  >
                    <MastheadTitle clubName={clubName} />
                    {clubEstablished && (
                      <div
                        style={{
                          fontFamily: META,
                          fontWeight: 500,
                          fontSize: 9,
                          letterSpacing: '0.06em',
                          color: MUTE,
                          marginTop: 8,
                        }}
                      >
                        {clubEstablished.toUpperCase()}
                      </div>
                    )}
                  </td>
                </tr>

                {/* ── FRONT PAGE ── */}
                <tr>
                  <td style={{ padding: '28px 40px 16px' }}>
                    <div
                      style={{
                        fontFamily: META,
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: '0.28em',
                        textTransform: 'uppercase',
                        color: BROWN,
                        textAlign: 'center',
                        marginBottom: 14,
                      }}
                    >
                      Confirmed{receiptNumber ? ` · Receipt ${receiptNumber}` : ''}
                    </div>
                    <h1
                      style={{
                        margin: '0 0 12px',
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 38,
                        letterSpacing: '-0.015em',
                        lineHeight: 1,
                        color: INK,
                        textAlign: 'center',
                      }}
                    >
                      Your entry is{' '}
                      <em style={{ fontStyle: 'italic', fontWeight: 400, color: BROWN }}>
                        confirmed
                      </em>
                      .
                    </h1>
                    <p
                      style={{
                        margin: 0,
                        textAlign: 'center',
                        fontFamily: DISPLAY,
                        fontStyle: 'italic',
                        fontWeight: 400,
                        fontSize: 16,
                        lineHeight: 1.5,
                        color: SOFT,
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
                      padding: '20px 40px 8px',
                      fontFamily: BODY_FONT,
                      fontSize: 15,
                      lineHeight: 1.65,
                      color: SOFT,
                    }}
                  >
                    <p style={{ margin: '0 0 14px' }}>
                      Dear{' '}
                      <em
                        style={{
                          fontFamily: DISPLAY,
                          fontStyle: 'italic',
                          fontWeight: 400,
                          color: INK,
                          fontSize: 17,
                        }}
                      >
                        {salutation}
                      </em>
                      ,
                    </p>
                    <p style={{ margin: '0 0 14px' }}>
                      Your entry has been received and the draw is complete. Below: the dog, the
                      runs, and your armband — please bring this email to check-in or write the
                      number on a slip of paper.
                    </p>
                    <p style={{ margin: 0 }}>We look forward to seeing you.</p>
                  </td>
                </tr>

                {/* ── DETAIL CARD ── */}
                <tr>
                  <td style={{ padding: '24px 40px 0' }}>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{ borderTop: `3px solid ${INK}`, borderBottom: `3px solid ${INK}` }}
                    >
                      <tr>
                        <td
                          style={{
                            padding: '14px 0 6px',
                            fontFamily: META,
                            fontWeight: 600,
                            fontSize: 10,
                            letterSpacing: '0.28em',
                            textTransform: 'uppercase',
                            color: BROWN,
                          }}
                        >
                          Section A · The Dog
                        </td>
                      </tr>
                      <tr>
                        <td
                          style={{
                            fontFamily: DISPLAY,
                            fontWeight: 900,
                            fontSize: 24,
                            letterSpacing: '-0.01em',
                            color: INK,
                            lineHeight: 1.1,
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
                              fontFamily: DISPLAY,
                              fontStyle: 'italic',
                              fontWeight: 400,
                              fontSize: 14,
                              color: BROWN,
                            }}
                          >
                            {dogLine}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '8px 0 0', borderTop: `1px dotted ${HAIR}` }}>
                          <RunsTable runs={runs} />
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '14px 0', borderTop: `1px solid ${INK}` }}>
                          <table
                            role="presentation"
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            border={0}
                          >
                            <tr>
                              <td
                                align="left"
                                style={{
                                  fontFamily: DISPLAY,
                                  fontStyle: 'italic',
                                  fontWeight: 400,
                                  fontSize: 15,
                                  color: SOFT,
                                }}
                              >
                                {runCount} {runCount === 1 ? 'run' : 'runs'} · Armband across all
                              </td>
                              <td
                                align="right"
                                style={{
                                  fontFamily: META,
                                  fontWeight: 500,
                                  fontSize: 10,
                                  letterSpacing: '0.18em',
                                  textTransform: 'uppercase',
                                  color: MUTE,
                                }}
                              >
                                Total {totalFeesFormatted}
                              </td>
                            </tr>
                          </table>
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
                    <td style={{ padding: '32px 40px 0' }}>
                      <div
                        style={{
                          fontFamily: META,
                          fontWeight: 600,
                          fontSize: 10,
                          letterSpacing: '0.28em',
                          textTransform: 'uppercase',
                          color: BROWN,
                          marginBottom: 6,
                        }}
                      >
                        Section B · On the Day
                      </div>
                      <h2
                        style={{
                          margin: '0 0 18px',
                          fontFamily: DISPLAY,
                          fontWeight: 900,
                          fontSize: 28,
                          letterSpacing: '-0.012em',
                          lineHeight: 1,
                          color: INK,
                        }}
                      >
                        {/*
                          Coalesce both candidates into a single variable so
                          the condition and the rendered value share their
                          truthiness semantics. Using `||` treats empty strings
                          as absent — admin-typed blank fields should fall
                          through to firstClassTime, then to the neutral
                          headline. The earlier mixed `||` / `??` pair would
                          have rendered an empty <em>…</em> when doorsTime was
                          a literal empty string.
                        */}
                        {(() => {
                          const arrival = doorsTime || firstClassTime || null;
                          return arrival ? (
                            <>
                              Be on site by{' '}
                              <em style={{ fontStyle: 'italic', fontWeight: 400, color: BROWN }}>
                                {arrival}
                              </em>
                              .
                            </>
                          ) : (
                            <>
                              On the{' '}
                              <em style={{ fontStyle: 'italic', fontWeight: 400, color: BROWN }}>
                                day
                              </em>
                              .
                            </>
                          );
                        })()}
                      </h2>
                      <table
                        role="presentation"
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        style={{ borderTop: `3px solid ${INK}` }}
                      >
                        <tr>
                          <td
                            width="50%"
                            style={{
                              padding: '14px 16px 14px 0',
                              borderBottom: `1px dotted ${HAIR}`,
                              verticalAlign: 'top',
                            }}
                          >
                            <InfoBlock label="Doors" value={doorsTime} />
                            <InfoBlock label="Crating" value={cratingNotes} />
                            <InfoBlock label="Parking" value={parkingNotes} />
                          </td>
                          <td
                            width="50%"
                            style={{
                              padding: '14px 0 14px 16px',
                              borderBottom: `1px dotted ${HAIR}`,
                              borderLeft: `1px dotted ${HAIR}`,
                              verticalAlign: 'top',
                            }}
                          >
                            <InfoBlock label="First class" value={firstClassTime} />
                            <InfoBlock label="Venue" value={venueNameAndAddress} />
                            <InfoBlock label="Hospitality" value={hospitalityNotes} />
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                )}

                {/* ── NOTICES (WITHDRAW) ── */}
                <tr>
                  <td style={{ padding: '24px 40px 0' }}>
                    <div
                      style={{
                        fontFamily: META,
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: '0.28em',
                        textTransform: 'uppercase',
                        color: BROWN,
                        marginBottom: 6,
                      }}
                    >
                      Section C · Notices
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: BODY_FONT,
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: SOFT,
                      }}
                    >
                      Draw is set, so refunds are no longer available, but please notify the
                      secretary if you cannot attend so we can release your slot. Email{' '}
                      {secretaryEmail ? (
                        <Link
                          href={`mailto:${secretaryEmail}`}
                          style={{
                            color: INK,
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontSize: 17,
                            textDecoration: 'underline',
                            textDecorationColor: HAIR,
                          }}
                        >
                          {secretaryEmail}
                        </Link>
                      ) : (
                        'the secretary'
                      )}
                      {secretaryPhone ? ` or call ${secretaryPhone}` : ''} as early as you can.
                    </p>
                  </td>
                </tr>

                {/* ── CTA ── */}
                {trialUrl && (
                  <tr>
                    <td style={{ padding: '28px 40px 0' }}>
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td style={{ background: INK }}>
                            <Link
                              href={trialUrl}
                              style={{
                                display: 'inline-block',
                                padding: '16px 28px',
                                fontFamily: DISPLAY,
                                fontWeight: 700,
                                fontSize: 15,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: PAPER,
                                textDecoration: 'none',
                              }}
                            >
                              View Trial Particulars ▸
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
                        padding: '32px 40px 8px',
                        fontFamily: BODY_FONT,
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: SOFT,
                      }}
                    >
                      <p style={{ margin: '0 0 18px' }}>With our compliments,</p>
                      {trialChairName && (
                        <p
                          style={{
                            margin: 0,
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontWeight: 400,
                            fontSize: 24,
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
                            fontFamily: META,
                            fontWeight: 500,
                            fontSize: 10,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: BROWN,
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
                      padding: '32px 40px',
                      borderTop: `4px double ${INK}`,
                      background: PAPER_WARM,
                    }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <MastheadTitle clubName={clubName} size={22} />
                    </div>
                    {clubEstablished && (
                      <div
                        style={{
                          fontFamily: META,
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          color: MUTE,
                          marginBottom: 18,
                        }}
                      >
                        {clubEstablished.toUpperCase()} · {memberClubLanguage.toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: META,
                        fontSize: 9,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: 'rgba(42,37,32,0.6)',
                        paddingTop: 16,
                        borderTop: `1px solid ${HAIR}`,
                        lineHeight: 1.7,
                      }}
                    >
                      You received this because you entered the trial.
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
