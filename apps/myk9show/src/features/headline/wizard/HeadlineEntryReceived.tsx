import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { headlineColors, headlineTypography } from '@/features/headline/tokens';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';

export type HeadlineEntryReceivedProps = HeritageEntryReceivedProps;

const PAPER = headlineColors.paper;
const INK = headlineColors.ink;
const SOFT = headlineColors.soft;
const MUTE = headlineColors.mute;
const HAIR = headlineColors.hair;
const ACCENT = headlineColors.accent;
const MARKER = headlineColors.marker;
const DISPLAY = headlineTypography.display;
const BODY = headlineTypography.body;
const MONO = headlineTypography.mono;

export function HeadlineEntryReceived({
  showName,
  clubName,
  dateRange,
  dogRegisteredName,
  dogCallName,
  classSummary,
  totalFeesFormatted,
  registrationNumber,
  confirmationDateLabel,
  onPrintEntryBlank,
}: HeadlineEntryReceivedProps) {
  const navigate = useNavigate();

  return (
    <div
      data-headline
      style={{ background: PAPER, color: INK, fontFamily: BODY }}
      className="rounded-sm"
    >
      <header
        style={{
          padding: '28px 28px 20px',
          borderBottom: `4px double ${INK}`,
        }}
      >
        <div className="mb-[18px] flex items-center gap-2.5">
          <span
            style={{
              background: ACCENT,
              color: PAPER,
              padding: '5px 9px',
              fontFamily: MONO,
              fontSize: '0.625rem',
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
            }}
          >
            Ready
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: '0.625rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            {registrationNumber ? `Entry #${registrationNumber}` : 'Entry pending'}
          </span>
        </div>

        <p
          style={{
            fontFamily: MONO,
            fontSize: '0.6875rem',
            fontWeight: 500,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: MUTE,
            margin: '0 0 12px',
          }}
        >
          {clubName}
        </p>

        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: '2.375rem',
            letterSpacing: '0',
            lineHeight: 0.95,
            margin: '0 0 12px',
            color: INK,
          }}
        >
          Ready to{' '}
          <span
            style={{
              background: MARKER,
              padding: '0 6px',
            }}
          >
            submit.
          </span>
        </h2>

        <p
          style={{
            fontFamily: BODY,
            fontSize: '0.875rem',
            lineHeight: 1.45,
            color: SOFT,
            margin: 0,
          }}
        >
          {showName}
          <span
            style={{
              display: 'block',
              color: MUTE,
              fontFamily: MONO,
              fontSize: '0.625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginTop: '4px',
            }}
          >
            {dateRange}
          </span>
        </p>
      </header>

      <div
        className="mx-7"
        style={{
          borderTop: `1px solid ${INK}`,
          borderBottom: `1px solid ${INK}`,
          padding: '16px 0',
        }}
      >
        <p
          style={{
            fontFamily: MONO,
            fontSize: '0.625rem',
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: ACCENT,
            margin: '0 0 6px',
          }}
        >
          § 01 · The dog
        </p>

        <p
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: '1.375rem',
            letterSpacing: '0',
            lineHeight: 1.1,
            color: INK,
            margin: '0 0 4px',
          }}
        >
          {dogRegisteredName}
        </p>

        {dogCallName && (
          <p
            style={{
              fontFamily: MONO,
              fontSize: '0.6875rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: MUTE,
              margin: '0 0 12px',
            }}
          >
            &ldquo;{dogCallName}&rdquo;
          </p>
        )}

        <p
          style={{
            fontFamily: BODY,
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: SOFT,
            margin: '0 0 14px',
          }}
        >
          {classSummary}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '16px',
            borderTop: `1px solid ${HAIR}`,
            paddingTop: '12px',
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: '0.625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            Total · Fees due
          </span>
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: '1.75rem',
              letterSpacing: '0',
              color: ACCENT,
            }}
          >
            {totalFeesFormatted}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-7 pb-4 pt-5">
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: INK,
            color: PAPER,
            fontFamily: DISPLAY,
            fontWeight: 700,
            letterSpacing: '0',
            border: 'none',
            borderRadius: 0,
          }}
          className="w-full transition-transform duration-150 hover:-translate-y-px hover:bg-[#c4302b]"
          aria-label="Print my entry blank"
        >
          <Download className="mr-2 h-4 w-4" />
          Print my entry blank
        </Button>

        <Button
          variant="outline"
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            color: INK,
            borderColor: INK,
            borderWidth: '1.5px',
            borderRadius: 0,
            fontFamily: DISPLAY,
            fontWeight: 700,
            letterSpacing: '0',
          }}
          className="w-full transition-colors duration-150 hover:bg-[#0a0a0a] hover:text-[#fafafa]"
          aria-label="Return to dashboard"
        >
          Return to dashboard
        </Button>
      </div>

      {confirmationDateLabel && (
        <p
          style={{
            textAlign: 'left',
            padding: '14px 28px 28px',
            fontFamily: BODY,
            fontSize: '0.75rem',
            lineHeight: 1.6,
            color: MUTE,
            borderTop: `1px solid ${HAIR}`,
            margin: '4px 0 0',
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: INK, fontWeight: 600 }}>{confirmationDateLabel}</strong> once the
          draw is complete.
          <span
            style={{
              display: 'block',
              marginTop: '6px',
              fontFamily: MONO,
              fontSize: '0.625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            Watch your inbox · Armband assignment included
          </span>
        </p>
      )}
    </div>
  );
}
