import { Body, Head, Html, Preview } from '@react-email/components';
import type { JSX } from 'react';
import type { ReactNode } from 'react';
import type { HeritageConfirmationProps, HeritageRunRow } from '../types';
import { HN } from '../headlineTokens';

function escText(value: string | null | undefined): string {
  return value ?? '';
}

function SectionKicker({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 10px',
        fontFamily: HN.MONO,
        fontSize: 11,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: HN.ACCENT,
      }}
    >
      {children}
    </p>
  );
}

function RunsTable({ runs }: { runs: HeritageRunRow[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tr>
        {['Trial', 'Day', 'Class', 'Judge', 'Armband'].map((header, index) => (
          <td
            key={header}
            style={{
              padding: '0 0 7px',
              borderBottom: `1px solid ${HN.INK}`,
              fontFamily: HN.MONO,
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: HN.MUTE,
              textAlign: index === 4 ? 'right' : 'left',
            }}
          >
            {header}
          </td>
        ))}
      </tr>
      {runs.map((run, index) => {
        const border = index === runs.length - 1 ? undefined : `1px solid ${HN.HAIR}`;
        return (
          <tr key={`${run.trialNumeral}-${run.classLabel}-${index}`}>
            <td
              style={{
                padding: '9px 0',
                borderBottom: border,
                fontFamily: HN.MONO,
                fontSize: 12,
                color: HN.ACCENT,
              }}
            >
              {run.trialNumeral}
            </td>
            <td
              style={{ padding: '9px 0', borderBottom: border, fontFamily: HN.BODY, fontSize: 13 }}
            >
              {run.dayLabel}
            </td>
            <td
              style={{ padding: '9px 0', borderBottom: border, fontFamily: HN.BODY, fontSize: 13 }}
            >
              {run.classLabel}
            </td>
            <td
              style={{ padding: '9px 0', borderBottom: border, fontFamily: HN.BODY, fontSize: 13 }}
            >
              {run.judgeName}
            </td>
            <td
              style={{
                padding: '9px 0',
                borderBottom: border,
                fontFamily: HN.DISPLAY,
                fontWeight: 800,
                fontSize: 16,
                color: HN.INK,
                textAlign: 'right',
              }}
            >
              {run.armband ?? '-'}
            </td>
          </tr>
        );
      })}
    </table>
  );
}

function InfoCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <p
        style={{
          margin: 0,
          fontFamily: HN.MONO,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: HN.MUTE,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '4px 0 12px',
          fontFamily: HN.BODY,
          fontSize: 13,
          lineHeight: 1.55,
          color: HN.INK,
        }}
      >
        {value}
      </p>
    </>
  );
}

export function HeadlineConfirmationEmail({
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
  memberClubLanguage,
}: HeritageConfirmationProps): JSX.Element {
  const dogLine = [dogCallName ? `"${dogCallName}"` : null, dogBreed, dogSex]
    .filter(Boolean)
    .join(' · ');

  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{`Confirmed: ${dogRegisteredName} is entered in ${showTitle}`}</Preview>

      <Body style={{ margin: 0, padding: 0, background: HN.PAGE }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          style={{ background: HN.PAGE, padding: '32px 0' }}
        >
          <tr>
            <td align="center">
              <table
                role="presentation"
                width={600}
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ width: 600, maxWidth: 600, background: HN.PAPER }}
              >
                <tr>
                  <td style={{ padding: '28px 34px 20px', borderBottom: `4px double ${HN.INK}` }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                      <tr>
                        <td
                          style={{
                            background: HN.ACCENT,
                            color: HN.PAPER,
                            padding: '5px 9px',
                            fontFamily: HN.MONO,
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Confirmed
                        </td>
                        <td
                          style={{
                            paddingLeft: 10,
                            fontFamily: HN.MONO,
                            fontSize: 10,
                            letterSpacing: '0.2em',
                            textTransform: 'uppercase',
                            color: HN.MUTE,
                          }}
                        >
                          {receiptNumber ? `Receipt #${receiptNumber}` : 'Entry receipt'}
                        </td>
                      </tr>
                    </table>

                    <p
                      style={{
                        margin: '18px 0 10px',
                        fontFamily: HN.MONO,
                        fontSize: 11,
                        letterSpacing: '0.24em',
                        textTransform: 'uppercase',
                        color: HN.MUTE,
                      }}
                    >
                      {clubName}
                      {clubCity ? ` · ${clubCity}` : ''}
                    </p>
                    <h1
                      style={{
                        margin: '0 0 12px',
                        fontFamily: HN.DISPLAY,
                        fontSize: 42,
                        fontWeight: 800,
                        lineHeight: 0.95,
                        color: HN.INK,
                      }}
                    >
                      You&apos;re{' '}
                      <span style={{ background: HN.MARKER, padding: '0 6px' }}>in.</span>
                    </h1>
                    <p style={{ margin: 0, fontFamily: HN.BODY, fontSize: 14, color: HN.SOFT }}>
                      {showTitle}
                      <br />
                      <span
                        style={{
                          fontFamily: HN.MONO,
                          fontSize: 10,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: HN.MUTE,
                        }}
                      >
                        {dateRange}
                      </span>
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style={{ padding: '22px 34px 10px' }}>
                    <p
                      style={{
                        margin: '0 0 14px',
                        fontFamily: HN.BODY,
                        fontSize: 15,
                        lineHeight: 1.6,
                        color: HN.SOFT,
                      }}
                    >
                      Dear <strong style={{ color: HN.INK }}>{escText(salutation)}</strong>, your
                      entry has been recorded. The draw has been completed and the running order is
                      set.
                    </p>
                    <SectionKicker>§ 01 · The dog</SectionKicker>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{
                        borderTop: `1px solid ${HN.INK}`,
                        borderBottom: `1px solid ${HN.INK}`,
                      }}
                    >
                      <tr>
                        <td style={{ padding: '16px 0' }}>
                          <p
                            style={{
                              margin: '0 0 4px',
                              fontFamily: HN.DISPLAY,
                              fontWeight: 800,
                              fontSize: 24,
                              lineHeight: 1.1,
                              color: HN.INK,
                            }}
                          >
                            {dogRegisteredName}
                          </p>
                          {dogLine && (
                            <p
                              style={{
                                margin: '0 0 14px',
                                fontFamily: HN.MONO,
                                fontSize: 11,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: HN.MUTE,
                              }}
                            >
                              {dogLine}
                            </p>
                          )}
                          <RunsTable runs={runs} />
                          <table
                            role="presentation"
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            border={0}
                            style={{ marginTop: 14, borderTop: `1px solid ${HN.HAIR}` }}
                          >
                            <tr>
                              <td
                                style={{
                                  paddingTop: 12,
                                  fontFamily: HN.MONO,
                                  fontSize: 10,
                                  letterSpacing: '0.18em',
                                  textTransform: 'uppercase',
                                  color: HN.MUTE,
                                }}
                              >
                                {runCount} {runCount === 1 ? 'run' : 'runs'} · fees received
                              </td>
                              <td
                                style={{
                                  paddingTop: 12,
                                  fontFamily: HN.DISPLAY,
                                  fontWeight: 800,
                                  fontSize: 28,
                                  color: HN.ACCENT,
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

                <tr>
                  <td style={{ padding: '22px 34px 4px' }}>
                    <SectionKicker>§ 02 · Bring to check-in</SectionKicker>
                    <table
                      role="presentation"
                      width="100%"
                      cellPadding={0}
                      cellSpacing={0}
                      border={0}
                      style={{ background: HN.ACCENT_SOFT, border: `1px solid ${HN.ACCENT}` }}
                    >
                      <tr>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', width: '50%' }}>
                          <InfoCell label="Doors" value={doorsTime} />
                          <InfoCell label="First class" value={firstClassTime} />
                          <InfoCell label="Crating" value={cratingNotes} />
                        </td>
                        <td style={{ padding: '14px 16px', verticalAlign: 'top', width: '50%' }}>
                          <InfoCell label="Venue" value={venueNameAndAddress} />
                          <InfoCell label="Parking" value={parkingNotes} />
                          <InfoCell label="Hospitality" value={hospitalityNotes} />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style={{ padding: '22px 34px 30px' }}>
                    <SectionKicker>§ 03 · Contact</SectionKicker>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: HN.BODY,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: HN.SOFT,
                      }}
                    >
                      Questions or withdrawals go to{' '}
                      {secretaryEmail ? (
                        <a
                          href={`mailto:${secretaryEmail}`}
                          style={{ color: HN.ACCENT, textDecoration: 'none' }}
                        >
                          {secretaryEmail}
                        </a>
                      ) : (
                        'the Trial Secretary'
                      )}
                      {secretaryPhone ? ` · ${secretaryPhone}` : ''}.
                    </p>
                    {trialUrl && (
                      <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
                        <tr>
                          <td style={{ paddingTop: 18 }}>
                            <a
                              href={trialUrl}
                              style={{
                                display: 'inline-block',
                                background: HN.INK,
                                color: HN.PAPER,
                                padding: '12px 18px',
                                fontFamily: HN.DISPLAY,
                                fontWeight: 700,
                                fontSize: 14,
                                textDecoration: 'none',
                              }}
                            >
                              View trial particulars
                            </a>
                          </td>
                        </tr>
                      </table>
                    )}
                  </td>
                </tr>

                <tr>
                  <td style={{ background: HN.INK, padding: '22px 34px', textAlign: 'center' }}>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: HN.MONO,
                        fontSize: 10,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        color: HN.PAPER,
                      }}
                    >
                      {clubName}
                    </p>
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontFamily: HN.BODY,
                        fontSize: 11,
                        color: 'rgba(250,250,250,0.7)',
                      }}
                    >
                      {memberClubLanguage}
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
