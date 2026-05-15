import { type JSX } from 'react';
import { MonogramEmboss } from './MonogramEmboss';
import { MONOGRAM_BODY_FAMILY } from '../fonts';
import { monogramColors, monogramSpacing } from '../tokens';
import { buildMonogram } from '../utils/buildMonogram';

export interface MonogramJudgeCardProps {
  /** Judge's full name — used to derive initials and rendered below them. */
  name: string;
  /** Credential / panel line, e.g. "Containers · Interiors". Rendered as
   *  bronze small-caps under the name. */
  credential?: string | null;
  /** Optional bio paragraph. */
  bio?: string | null;
  /** Pre-computed initials override. Defaults to buildMonogram(name, 2) so we
   *  cap at 2 letters for the 64px slot (3 chars overflow the column). */
  initialsOverride?: string;
}

/**
 * A single judge entry rendered in the Monogram register: 64px solid-bronze
 * initials act as the portrait, with name + credential + bio underneath.
 *
 * The mock uses 2-letter initials throughout (CB / MW) regardless of how many
 * words are in the name — we cap at 2 here, distinct from the default
 * `buildMonogram` cap of 3 used for club names.
 */
export function MonogramJudgeCard({
  name,
  credential,
  bio,
  initialsOverride,
}: MonogramJudgeCardProps): JSX.Element {
  const initials = initialsOverride ?? buildMonogram(name, 2);

  return (
    <article className="mg-judge-card">
      <MonogramEmboss
        letters={initials}
        size={monogramSpacing.judgeMonogramSize}
        variant="solid"
        solidColor={monogramColors.bronze}
        className="mg-judge-card__monogram"
      />
      <h3
        className="mg-judge-card__name"
        style={{
          fontFamily: "'Bodoni Moda', Georgia, serif",
          fontSize: 28,
          color: monogramColors.ink,
          letterSpacing: '-0.015em',
          margin: '14px 0 4px',
          lineHeight: 1.15,
        }}
      >
        {name}
      </h3>
      {credential && (
        <p
          className="mg-judge-card__credential"
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 11,
            color: monogramColors.bronze,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            fontWeight: 500,
            margin: '0 0 16px',
          }}
        >
          {credential}
        </p>
      )}
      {bio && (
        <p
          className="mg-judge-card__bio"
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 15,
            lineHeight: 1.6,
            color: monogramColors.soft,
            margin: 0,
          }}
        >
          {bio}
        </p>
      )}
    </article>
  );
}
