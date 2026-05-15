import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { BannerFee } from '../types';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  fees: BannerFee[];
  trialsCount: number;
  timezone: string;
  flag: string;
}

interface Row {
  label: string;
  value: React.ReactNode;
}

export function ParticularsSection({
  licenseLanguage,
  entryOpenDate,
  entryCloseDate,
  confirmationDate,
  entryLimit,
  fees,
  trialsCount,
  timezone,
  flag,
}: ParticularsSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const fmt = (iso: string | null) =>
    iso ? formatDateInTimezone(iso, timezone, 'short') : null;

  const rows: Row[] = [
    { label: 'License', value: licenseLanguage },
    { label: 'Trials', value: trialsCount > 0 ? `${trialsCount}` : null },
    { label: 'Entries open', value: fmt(entryOpenDate) },
    { label: 'Entries close', value: fmt(entryCloseDate) },
    { label: 'Confirmation', value: fmt(confirmationDate) },
    {
      label: 'Entry limit',
      value: entryLimit != null ? `${entryLimit} runs · firm` : null,
    },
  ].filter(r => r.value);

  return (
    <section
      id="particulars"
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="02" label="Particulars" flag={flag}>
        The <span style={{ color: flag }}>facts.</span>
      </BannerSectionHead>

      <div ref={ref} className={`bn-reveal ${revealed ? 'in' : ''}`}>
        {rows.length > 0 && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: BANNER_BODY_FAMILY,
              marginBottom: 48,
            }}
          >
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.label}-${i}`} style={{ borderBottom: `1px solid ${bannerColors.hair}` }}>
                  <td
                    style={{
                      padding: '18px 0',
                      width: 240,
                      fontFamily: BANNER_BODY_FAMILY,
                      fontWeight: 500,
                      fontSize: 11,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      color: bannerColors.mute,
                      verticalAlign: 'top',
                    }}
                  >
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: '18px 0',
                      fontFamily: BANNER_DISPLAY_FAMILY,
                      fontWeight: 700,
                      fontSize: 20,
                      letterSpacing: '-0.02em',
                      color: bannerColors.ink,
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {fees.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(4, fees.length)}, 1fr)`,
              gap: 0,
              borderTop: `2px solid ${flag}`,
              borderBottom: `2px solid ${flag}`,
              marginTop: 48,
            }}
          >
            {fees.map((fee, i) => (
              <div
                key={`${fee.label}-${i}`}
                style={{
                  padding: '32px 24px',
                  borderRight:
                    i === fees.length - 1 ? 'none' : `1px solid ${bannerColors.hair}`,
                }}
              >
                <div
                  style={{
                    fontFamily: BANNER_BODY_FAMILY,
                    fontWeight: 500,
                    fontSize: 10,
                    letterSpacing: '0.28em',
                    textTransform: 'uppercase',
                    color: bannerColors.mute,
                    marginBottom: 8,
                  }}
                >
                  {fee.label}
                </div>
                <div
                  style={{
                    fontFamily: BANNER_DISPLAY_FAMILY,
                    fontWeight: 900,
                    fontSize: 40,
                    letterSpacing: '-0.04em',
                    color: bannerColors.ink,
                    lineHeight: 1,
                  }}
                >
                  {fee.amount}
                </div>
                {fee.sub && (
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: BANNER_BODY_FAMILY,
                      fontSize: 12,
                      color: bannerColors.mute,
                    }}
                  >
                    {fee.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
