import type { CSSProperties } from 'react';

interface RecordingFeeSectionProps {
  /** `LandingData.recordingFee`: the published premium's statement, or null when it has none. */
  statement: string | null | undefined;
  /** Per-theme tuning from the hosting landing, like ScoutingStatementSection. */
  className?: string;
  style?: CSSProperties;
}

/**
 * MYK9-2044: the registry recording fee (AKC Scent Work Regulations Ch. 3 §15, "AKC recording
 * fee shall be stated"), printed on the public landing in the words the published premium PDF
 * prints. One component for all eight styles, like ScoutingStatementSection, so no style can
 * drop it; it inherits the host's colour and fonts.
 */
export function RecordingFeeSection({ statement, className, style }: RecordingFeeSectionProps) {
  if (!statement) return null;

  return (
    <section
      data-testid="landing-recording-fee"
      aria-label="Recording fee"
      className={className}
      style={{ color: 'currentColor', ...style }}
    >
      <p>{statement}</p>
    </section>
  );
}
