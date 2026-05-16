import { Body, Head, Html, Link, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { MagazineConfirmationProps, MagazineRunRow } from '../types';
import { MZ } from '../magazineTokens';

const { INK, SOFT, PAPER, MUTE, QUILL, GOLD1, GOLD2, GOLD3, PAGE, DISPLAY, BODY, META } = MZ;

// ─── Outlook safety guarantee ────────────────────────────────────────────────
//
// Per the reconciliation notes (§"Gradient text in email — Outlook caveat"),
// this template never uses `-webkit-background-clip: text` or any gradient-on-
// text trick. All gold-emphasis text uses solid `color: GOLD3` directly. The
// only place we use a CSS gradient is the dark footer band, where it falls
// back to a solid color via the `<td bgcolor>` attribute.

/**
 * 600px email-body gold-gradient hairline. Implemented as a 2px-high `<div>`
 * inside a `<td>` rather than a CSS border because Outlook strips borders on
 * inline-block divs in some clients.
 */
function GoldRule({ thick = false, margin = 0 }: { thick?: boolean; margin?: number | string }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ marginTop: margin, marginBottom: margin }}
    >
      <tbody>
        <tr>
          <td
            style={{
              background: `linear-gradient(90deg, ${GOLD1}, ${GOLD2})`,
              backgroundColor: GOLD2,
              height: thick ? 2 : 1,
              lineHeight: thick ? '2px' : '1px',
              fontSize: 0,
            }}
          >
            &nbsp;
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function RunsTable({ runs }: { runs: MagazineRunRow[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <thead>
        <tr>
          {['Trial', 'Day', 'Class', 'Judge', '№'].map((h, i) => (
            <th
              key={h}
              align={i === 4 ? 'right' : 'left'}
              style={{
                padding: '10px 8px 8px 0',
                fontFamily: META,
                fontWeight: 500,
                fontSize: 9,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: MUTE,
                borderBottom: `1px dotted ${GOLD2}`,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((run, i) => {
          const isLast = i === runs.length - 1;
          const cellBorder = isLast ? undefined : `1px dotted ${GOLD2}`;
          return (
            <tr key={`${run.trialNumeral}-${i}`}>
              <td
                style={{
                  padding: '11px 8px 11px 0',
                  fontFamily: DISPLAY,
                  fontStyle: 'italic',
                  fontWeight: 500,
                  fontSize: 18,
                  color: GOLD3,
                  borderBottom: cellBorder,
                }}
              >
                {run.trialNumeral}
              </td>
              <td
                style={{
                  padding: '11px 8px',
                  fontFamily: BODY,
                  fontSize: 13,
                  color: INK,
                  borderBottom: cellBorder,
                }}
              >
                {run.dayLabel}
              </td>
              <td
                style={{
                  padding: '11px 8px',
                  fontFamily: DISPLAY,
                  fontStyle: 'italic',
                  fontSize: 15,
                  color: INK,
                  borderBottom: cellBorder,
                }}
              >
                {run.classLabel}
              </td>
              <td
                style={{
                  padding: '11px 8px',
                  fontFamily: BODY,
                  fontSize: 13,
                  color: INK,
                  borderBottom: cellBorder,
                }}
              >
                {run.judgeName}
              </td>
              <td
                align="right"
                style={{
                  padding: '11px 0 11px 8px',
                  fontFamily: DISPLAY,
                  fontWeight: 500,
                  fontSize: 20,
                  color: INK,
                  borderBottom: cellBorder,
                }}
              >
                {run.armband ?? '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InfoCell({
  label,
  value,
  borderLeft = false,
  borderBottom = `1px dotted ${GOLD2}`,
}: {
  label: string;
  value: string | null;
  borderLeft?: boolean;
  borderBottom?: string;
}) {
  if (!value) return null;
  return (
    <td
      width="50%"
      style={{
        padding: borderLeft ? '14px 0 14px 16px' : '14px 16px 14px 0',
        borderBottom,
        borderLeft: borderLeft ? `1px dotted ${GOLD2}` : undefined,
        verticalAlign: 'top',
      }}
    >
      <div
        style={{
          fontFamily: META,
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: MUTE,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 20,
          color: INK,
          whiteSpace: 'pre-line',
        }}
      >
        {value}
      </div>
    </td>
  );
}

/**
 * Magazine confirmation email — editorial post-confirmation transactional.
 *
 * Visual sections (from `Magazine Confirmation Email.html`):
 *  1. Top meta strip — edition + "View in browser" link
 *  2. Header with smallcaps eyebrow ("Confirmed · Entry № …"), oversized
 *     Cormorant title with italic gold-3 accent on "confirmed", italic dek
 *  3. Gold gradient hairline
 *  4. Greeting paragraph
 *  5. Entry detail card — dog particulars, 3-column runs table, armband
 *     callout row with receipt + total
 *  6. On-the-day grid (doors / first class / crating / parking / hospitality
 *     / venue)
 *  7. Withdraw paragraph
 *  8. View-trial-particulars CTA
 *  9. Signoff with italic chair signature
 * 10. Dark editorial footer band with member-club language and fine print
 *
 * Outlook safety: no `background-clip: text`, no `-webkit-background-clip`,
 * all gold emphasis text is solid `color: GOLD3`. The footer's gradient
 * background is on a `<td>` with a `bgcolor` fallback to `GOLD3`.
 */
export function MagazineConfirmationEmail({
  clubName,
  clubEstablished,
  clubCity,
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
  primaryArmband,
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
  licenseReference,
}: MagazineConfirmationProps): JSX.Element {
  const dogLine = [dogCallName ? `called "${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  const eyebrow = receiptNumber
    ? `Confirmed · Entry № ${receiptNumber}`
    : 'Confirmed · Entry received';

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Source+Serif+4:ital,wght@0,400;0,500;0,600;1,400&family=Inter+Tight:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Your entry to ${showTitle} is confirmed — ${salutation}`}</Preview>

      <Body style={{ margin: 0, padding: '32px 0', background: PAGE }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: PAGE }}
        >
          <tbody>
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
                  <tbody>
                    {/* ── TOP META STRIP ── */}
                    <tr>
                      <td style={{ padding: '16px 40px 0' }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          border={0}
                        >
                          <tbody>
                            <tr>
                              <td
                                align="left"
                                style={{
                                  fontFamily: META,
                                  fontWeight: 500,
                                  fontSize: 10,
                                  letterSpacing: '0.32em',
                                  textTransform: 'uppercase',
                                  color: MUTE,
                                }}
                              >
                                {editionLabel}
                              </td>
                              <td
                                align="right"
                                style={{
                                  fontFamily: META,
                                  fontWeight: 500,
                                  fontSize: 10,
                                  letterSpacing: '0.32em',
                                  textTransform: 'uppercase',
                                  color: MUTE,
                                }}
                              >
                                {trialUrl ? (
                                  <Link
                                    href={trialUrl}
                                    style={{ color: MUTE, textDecoration: 'none' }}
                                  >
                                    View in browser
                                  </Link>
                                ) : null}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* ── HEADER ── */}
                    <tr>
                      <td style={{ padding: '32px 40px 4px' }}>
                        <div
                          style={{
                            fontFamily: META,
                            fontWeight: 500,
                            fontSize: 11,
                            letterSpacing: '0.32em',
                            textTransform: 'uppercase',
                            color: GOLD3,
                            marginBottom: 16,
                          }}
                        >
                          {eyebrow}
                        </div>
                        <h1
                          style={{
                            margin: '0 0 16px',
                            fontFamily: DISPLAY,
                            fontWeight: 500,
                            fontSize: 46,
                            letterSpacing: '-0.015em',
                            lineHeight: 1.0,
                            color: INK,
                          }}
                        >
                          Your entry is{' '}
                          <em style={{ fontStyle: 'italic', color: GOLD3 }}>confirmed</em>.
                        </h1>
                        <p
                          style={{
                            margin: '0 0 16px',
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontSize: 18,
                            lineHeight: 1.45,
                            color: QUILL,
                          }}
                        >
                          {showTitle} · {dateRange}
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ padding: '0 40px' }}>
                        <GoldRule thick />
                      </td>
                    </tr>

                    {/* ── GREETING ── */}
                    <tr>
                      <td
                        style={{
                          padding: '28px 40px 8px',
                          fontFamily: BODY,
                          fontSize: 16,
                          lineHeight: 1.7,
                          color: SOFT,
                        }}
                      >
                        <p style={{ margin: '0 0 14px' }}>
                          Dear{' '}
                          <em
                            style={{
                              fontFamily: DISPLAY,
                              fontStyle: 'italic',
                              color: INK,
                              fontSize: 18,
                            }}
                          >
                            {salutation}
                          </em>
                          ,
                        </p>
                        <p style={{ margin: '0 0 14px' }}>
                          Your entry has been received and the draw is complete. You will find the
                          dog, the runs, and your armband number below. Please bring this email to
                          check-in.
                        </p>
                      </td>
                    </tr>

                    {/* ── DETAIL CARD ── */}
                    <tr>
                      <td style={{ padding: '28px 40px 0' }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          border={0}
                          style={{
                            borderTop: `1px solid ${INK}`,
                            borderBottom: `1px solid ${INK}`,
                          }}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  padding: '18px 0 6px',
                                  fontFamily: META,
                                  fontWeight: 500,
                                  fontSize: 11,
                                  letterSpacing: '0.32em',
                                  textTransform: 'uppercase',
                                  color: GOLD3,
                                }}
                              >
                                Article i · The dog
                              </td>
                            </tr>
                            <tr>
                              <td
                                style={{
                                  fontFamily: DISPLAY,
                                  fontWeight: 500,
                                  fontSize: 28,
                                  letterSpacing: '-0.005em',
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
                                    padding: '6px 0 18px',
                                    fontFamily: DISPLAY,
                                    fontStyle: 'italic',
                                    fontSize: 16,
                                    color: QUILL,
                                  }}
                                >
                                  {dogLine}
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td style={{ padding: '8px 0 0' }}>
                                <GoldRule margin="0 0 8px" />
                                <RunsTable runs={runs} />
                              </td>
                            </tr>
                            <tr>
                              <td style={{ padding: '14px 0 18px', borderTop: `1px solid ${INK}` }}>
                                <table
                                  role="presentation"
                                  width="100%"
                                  cellPadding={0}
                                  cellSpacing={0}
                                  border={0}
                                >
                                  <tbody>
                                    <tr>
                                      <td
                                        align="left"
                                        style={{
                                          fontFamily: DISPLAY,
                                          fontStyle: 'italic',
                                          fontSize: 15,
                                          color: QUILL,
                                        }}
                                      >
                                        {primaryArmband ? (
                                          <>
                                            Armband{' '}
                                            <span
                                              style={{
                                                color: GOLD3,
                                                fontWeight: 500,
                                                fontSize: 22,
                                              }}
                                            >
                                              {primaryArmband}
                                            </span>{' '}
                                            across all runs
                                          </>
                                        ) : (
                                          <>{runCount} runs entered</>
                                        )}
                                      </td>
                                      <td
                                        align="right"
                                        style={{
                                          fontFamily: META,
                                          fontWeight: 500,
                                          fontSize: 11,
                                          letterSpacing: '0.28em',
                                          textTransform: 'uppercase',
                                          color: MUTE,
                                        }}
                                      >
                                        {receiptNumber ? `Receipt ${receiptNumber} · ` : ''}
                                        {totalFeesFormatted}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
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
                        <td style={{ padding: '36px 40px 0' }}>
                          <div
                            style={{
                              fontFamily: META,
                              fontWeight: 500,
                              fontSize: 11,
                              letterSpacing: '0.32em',
                              textTransform: 'uppercase',
                              color: GOLD3,
                              marginBottom: 8,
                            }}
                          >
                            Article ii · On the day
                          </div>
                          <h2
                            style={{
                              margin: '0 0 24px',
                              fontFamily: DISPLAY,
                              fontWeight: 500,
                              fontSize: 34,
                              letterSpacing: '-0.01em',
                              lineHeight: 1.05,
                              color: INK,
                            }}
                          >
                            Be on site by{' '}
                            <em style={{ fontStyle: 'italic', color: GOLD3 }}>
                              {doorsTime ?? '7:30'}
                            </em>
                            .
                          </h2>

                          <table
                            role="presentation"
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            border={0}
                            style={{ borderTop: `1px solid ${INK}` }}
                          >
                            <tbody>
                              <tr>
                                <InfoCell label="Doors open" value={doorsTime} />
                                <InfoCell label="First class" value={firstClassTime} borderLeft />
                              </tr>
                              <tr>
                                <InfoCell label="Crating" value={cratingNotes} />
                                <InfoCell label="Parking" value={parkingNotes} borderLeft />
                              </tr>
                              <tr>
                                <InfoCell
                                  label="Hospitality"
                                  value={hospitalityNotes}
                                  borderBottom={`1px solid ${INK}`}
                                />
                                <InfoCell
                                  label="Venue"
                                  value={venueNameAndAddress}
                                  borderLeft
                                  borderBottom={`1px solid ${INK}`}
                                />
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── WITHDRAW ── */}
                    <tr>
                      <td style={{ padding: '36px 40px 0' }}>
                        <div
                          style={{
                            fontFamily: META,
                            fontWeight: 500,
                            fontSize: 11,
                            letterSpacing: '0.32em',
                            textTransform: 'uppercase',
                            color: GOLD3,
                            marginBottom: 8,
                          }}
                        >
                          Article iii · If you must withdraw
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: BODY,
                            fontSize: 15,
                            lineHeight: 1.7,
                            color: SOFT,
                          }}
                        >
                          The draw is set, so refunds are no longer available, but please notify the
                          secretary if you cannot attend so we can release your slot.
                          {secretaryEmail && (
                            <>
                              {' '}
                              Email{' '}
                              <Link
                                href={`mailto:${secretaryEmail}`}
                                style={{
                                  color: INK,
                                  fontFamily: DISPLAY,
                                  fontStyle: 'italic',
                                  fontSize: 17,
                                  textDecoration: 'underline',
                                }}
                              >
                                {secretaryEmail}
                              </Link>
                            </>
                          )}
                          {secretaryPhone && <> or telephone {secretaryPhone}</>}.
                        </p>
                      </td>
                    </tr>

                    {/* ── CTA ── */}
                    {trialUrl && (
                      <tr>
                        <td style={{ padding: '28px 40px 0' }}>
                          <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                            <tbody>
                              <tr>
                                <td style={{ background: INK }}>
                                  <Link
                                    href={trialUrl}
                                    style={{
                                      display: 'inline-block',
                                      padding: '16px 28px',
                                      fontFamily: DISPLAY,
                                      fontStyle: 'italic',
                                      fontSize: 16,
                                      color: PAPER,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    View trial particulars →
                                  </Link>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}

                    {/* ── SIGNOFF ── */}
                    {(trialChairName || trialChairTitle) && (
                      <tr>
                        <td
                          style={{
                            padding: '36px 40px 8px',
                            fontFamily: BODY,
                            fontSize: 15,
                            lineHeight: 1.7,
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
                                fontSize: 11,
                                letterSpacing: '0.32em',
                                textTransform: 'uppercase',
                                color: GOLD3,
                              }}
                            >
                              {trialChairTitle}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}

                    {/* ── FOOTER (dark editorial band) ── */}
                    <tr>
                      <td
                        style={{
                          padding: '36px 40px',
                          background: `linear-gradient(135deg, ${GOLD3} 0%, ${SOFT} 60%, ${INK} 100%)`,
                          backgroundColor: GOLD3,
                          color: PAPER,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: DISPLAY,
                            fontStyle: 'italic',
                            fontSize: 20,
                            color: PAPER,
                            marginBottom: 6,
                          }}
                        >
                          {clubName}
                        </div>
                        <div
                          style={{
                            fontFamily: BODY,
                            fontSize: 12,
                            color: 'rgba(246,241,232,0.7)',
                            marginBottom: 20,
                          }}
                        >
                          {[clubEstablished, clubCity, memberClubLanguage]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        <div
                          style={{
                            fontFamily: META,
                            fontWeight: 500,
                            fontSize: 9,
                            letterSpacing: '0.32em',
                            textTransform: 'uppercase',
                            color: 'rgba(246,241,232,0.5)',
                            paddingTop: 18,
                            borderTop: '1px solid rgba(246,241,232,0.18)',
                            lineHeight: 1.7,
                          }}
                        >
                          You received this because you entered the {showTitle}.
                          {licenseReference ? <> · {licenseReference}</> : null}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}
